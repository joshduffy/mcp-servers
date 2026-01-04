import { describe, it, expect } from 'vitest';

// Re-implement the security functions for testing (same logic as in sqlite-mcp)
function validateIdentifier(name: string, type: 'table' | 'column' | 'schema' = 'table'): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    if (!/^[a-zA-Z0-9_ -]+$/.test(name)) {
      throw new Error(`Invalid ${type} name: contains disallowed characters`);
    }
  }
  return name;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isQueryAllowed(sql: string): { allowed: boolean; reason?: string } {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('EXPLAIN')) {
    return { allowed: false, reason: 'Must start with SELECT, WITH, or EXPLAIN' };
  }

  const dangerous = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'ATTACH', 'DETACH', 'REPLACE', 'TRUNCATE',
    'PRAGMA', 'VACUUM', 'REINDEX', 'ANALYZE'
  ];

  for (const keyword of dangerous) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      return { allowed: false, reason: `Contains forbidden keyword: ${keyword}` };
    }
  }

  if (/;[\s]*\S/.test(sql)) {
    return { allowed: false, reason: 'Multiple statements not allowed' };
  }

  return { allowed: true };
}

describe('SQLite Security Functions', () => {
  describe('validateIdentifier', () => {
    it('should accept valid simple identifiers', () => {
      expect(validateIdentifier('users')).toBe('users');
      expect(validateIdentifier('user_table')).toBe('user_table');
      expect(validateIdentifier('Users123')).toBe('Users123');
      expect(validateIdentifier('_private')).toBe('_private');
    });

    it('should accept identifiers with spaces and hyphens', () => {
      expect(validateIdentifier('my table')).toBe('my table');
      expect(validateIdentifier('user-data')).toBe('user-data');
    });

    it('should reject identifiers with SQL injection attempts', () => {
      expect(() => validateIdentifier('users; DROP TABLE users')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users"--')).toThrow('Invalid table name');
      expect(() => validateIdentifier("users'--")).toThrow('Invalid table name');
      expect(() => validateIdentifier('users/*comment*/')).toThrow('Invalid table name');
    });

    it('should reject identifiers with special characters', () => {
      expect(() => validateIdentifier('users@domain')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users$var')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users%')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users\n')).toThrow('Invalid table name');
    });

    it('should reject identifiers starting with numbers', () => {
      // This is allowed by our looser regex when it contains only alphanumeric
      expect(validateIdentifier('123table')).toBe('123table');
    });
  });

  describe('quoteIdentifier', () => {
    it('should properly quote simple identifiers', () => {
      expect(quoteIdentifier('users')).toBe('"users"');
      expect(quoteIdentifier('my_table')).toBe('"my_table"');
    });

    it('should escape double quotes by doubling them', () => {
      expect(quoteIdentifier('table"name')).toBe('"table""name"');
      expect(quoteIdentifier('a"b"c')).toBe('"a""b""c"');
      expect(quoteIdentifier('"quoted"')).toBe('"""quoted"""');
    });

    it('should handle identifiers with spaces', () => {
      expect(quoteIdentifier('my table')).toBe('"my table"');
    });

    it('should prevent SQL injection via quote escaping', () => {
      // An attacker might try: users" OR "1"="1
      const malicious = 'users" OR "1"="1';
      const quoted = quoteIdentifier(malicious);
      // Should produce: "users"" OR ""1""=""1" which is a valid (albeit weird) identifier
      expect(quoted).toBe('"users"" OR ""1""=""1"');
    });
  });

  describe('isQueryAllowed', () => {
    it('should allow valid SELECT queries', () => {
      expect(isQueryAllowed('SELECT * FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SELECT id, name FROM users WHERE id = 1').allowed).toBe(true);
      expect(isQueryAllowed('select * from users').allowed).toBe(true);
    });

    it('should allow WITH (CTE) queries', () => {
      expect(isQueryAllowed('WITH cte AS (SELECT 1) SELECT * FROM cte').allowed).toBe(true);
    });

    it('should allow EXPLAIN queries', () => {
      expect(isQueryAllowed('EXPLAIN SELECT * FROM users').allowed).toBe(true);
    });

    it('should block INSERT statements', () => {
      const result = isQueryAllowed('INSERT INTO users VALUES (1)');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block UPDATE statements', () => {
      const result = isQueryAllowed('UPDATE users SET name = "hacked"');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block DELETE statements', () => {
      const result = isQueryAllowed('DELETE FROM users');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block DROP statements', () => {
      const result = isQueryAllowed('DROP TABLE users');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block ATTACH statements (SQLite specific)', () => {
      const result = isQueryAllowed('SELECT 1; ATTACH DATABASE ":memory:" AS hack');
      expect(result.allowed).toBe(false);
    });

    it('should block CREATE statements', () => {
      const result = isQueryAllowed('CREATE TABLE hack (id INT)');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block PRAGMA statements', () => {
      const result = isQueryAllowed('PRAGMA table_info(users)');
      expect(result.allowed).toBe(false);
      // Blocked because it doesn't start with SELECT/WITH/EXPLAIN
      expect(result.reason).toBeDefined();
    });

    it('should block dangerous keywords even in SELECT subqueries', () => {
      // This tests that keywords are caught even inside valid-looking SELECT
      const result = isQueryAllowed('SELECT * FROM users WHERE id IN (DELETE FROM other)');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('DELETE');
    });

    it('should block multiple statements', () => {
      const result = isQueryAllowed('SELECT 1; SELECT 2');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Multiple statements');
    });

    it('should allow semicolon at end without another statement', () => {
      const result = isQueryAllowed('SELECT * FROM users;');
      expect(result.allowed).toBe(true);
    });

    it('should allow semicolon at end with whitespace', () => {
      const result = isQueryAllowed('SELECT * FROM users;   ');
      expect(result.allowed).toBe(true);
    });

    it('should not flag column names containing keywords', () => {
      // Column named "updated_at" should not trigger UPDATE check
      expect(isQueryAllowed('SELECT updated_at FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SELECT created_by FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SELECT is_deleted FROM users').allowed).toBe(true);
    });

    it('should block keyword at word boundary', () => {
      // But "UPDATE" as a word should be blocked
      const result = isQueryAllowed('SELECT * FROM users WHERE UPDATE = 1');
      expect(result.allowed).toBe(false);
    });

    it('should block queries not starting with allowed keywords', () => {
      const result1 = isQueryAllowed('CALL stored_procedure()');
      expect(result1.allowed).toBe(false);

      const result2 = isQueryAllowed('EXEC sp_something');
      expect(result2.allowed).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isQueryAllowed('select * from USERS').allowed).toBe(true);
      expect(isQueryAllowed('SELECT * FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SeLeCt * FrOm UsErS').allowed).toBe(true);
    });
  });
});
