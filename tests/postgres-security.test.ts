import { describe, it, expect } from 'vitest';

// Re-implement the security functions for testing (same logic as in postgres-mcp)
function validateIdentifier(name: string, type: 'table' | 'schema' = 'table'): string {
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

function isQueryAllowed(query: string): { allowed: boolean; reason?: string } {
  const trimmedQuery = query.trim().toLowerCase();

  const dangerous = [
    'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate',
    'grant', 'revoke', 'copy', 'execute', 'lock', 'into'
  ];

  for (const keyword of dangerous) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(query)) {
      return { allowed: false, reason: `Contains forbidden keyword: ${keyword.toUpperCase()}` };
    }
  }

  if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('with')) {
    return { allowed: false, reason: 'Only SELECT queries are allowed' };
  }

  return { allowed: true };
}

describe('PostgreSQL Security Functions', () => {
  describe('validateIdentifier', () => {
    it('should accept valid PostgreSQL identifiers', () => {
      expect(validateIdentifier('users', 'table')).toBe('users');
      expect(validateIdentifier('public', 'schema')).toBe('public');
      expect(validateIdentifier('user_accounts', 'table')).toBe('user_accounts');
      expect(validateIdentifier('MyTable123', 'table')).toBe('MyTable123');
    });

    it('should accept identifiers with spaces (need quoting)', () => {
      expect(validateIdentifier('my table', 'table')).toBe('my table');
      expect(validateIdentifier('My Schema', 'schema')).toBe('My Schema');
    });

    it('should reject SQL injection attempts', () => {
      expect(() => validateIdentifier('users; DROP TABLE users--', 'table')).toThrow('Invalid table name');
      expect(() => validateIdentifier("users' OR '1'='1", 'table')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users"--', 'table')).toThrow('Invalid table name');
    });

    it('should reject identifiers with dangerous characters', () => {
      expect(() => validateIdentifier('users;', 'table')).toThrow('Invalid table name');
      expect(() => validateIdentifier("users'", 'table')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users()', 'table')).toThrow('Invalid table name');
      expect(() => validateIdentifier('users/*', 'table')).toThrow('Invalid table name');
    });

    it('should reject identifiers with newlines', () => {
      expect(() => validateIdentifier('users\nDROP TABLE users', 'table')).toThrow('Invalid table name');
    });
  });

  describe('quoteIdentifier', () => {
    it('should properly quote PostgreSQL identifiers', () => {
      expect(quoteIdentifier('users')).toBe('"users"');
      expect(quoteIdentifier('public')).toBe('"public"');
    });

    it('should escape embedded double quotes', () => {
      expect(quoteIdentifier('table"name')).toBe('"table""name"');
      expect(quoteIdentifier('"already"quoted"')).toBe('"""already""quoted"""');
    });

    it('should handle identifiers with spaces', () => {
      expect(quoteIdentifier('my table')).toBe('"my table"');
      expect(quoteIdentifier('My Schema')).toBe('"My Schema"');
    });

    it('should prevent SQL breakout via quote escaping', () => {
      // Attack: Try to break out with "; DROP TABLE users--
      const attack = '"; DROP TABLE users--';
      const quoted = quoteIdentifier(attack);
      // Input has 1 quote, which becomes 2 (escaped), then wrapped with 2 more = 4 total
      // Output: """; DROP TABLE users--"
      // - Position 0: opening wrapper quote
      // - Position 1-2: escaped quote (was the attack's ")
      // - Position end: closing wrapper quote
      expect(quoted).toBe('"""; DROP TABLE users--"');
      expect(quoted.match(/"/g)?.length).toBe(4);
      // The key point: the attacker's quote is now escaped, preventing breakout
    });
  });

  describe('isQueryAllowed - PostgreSQL specific', () => {
    it('should allow valid SELECT queries', () => {
      expect(isQueryAllowed('SELECT * FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SELECT id, name FROM public.users').allowed).toBe(true);
    });

    it('should allow WITH (CTE) queries', () => {
      expect(isQueryAllowed('WITH active AS (SELECT * FROM users WHERE active) SELECT * FROM active').allowed).toBe(true);
    });

    it('should block INSERT statements', () => {
      const result = isQueryAllowed('INSERT INTO users (name) VALUES (\'test\')');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('INSERT');
    });

    it('should block UPDATE statements', () => {
      const result = isQueryAllowed('UPDATE users SET name = \'hacked\'');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('UPDATE');
    });

    it('should block DELETE statements', () => {
      const result = isQueryAllowed('DELETE FROM users WHERE id = 1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('DELETE');
    });

    it('should block DROP statements', () => {
      const result = isQueryAllowed('DROP TABLE users');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('DROP');
    });

    it('should block TRUNCATE statements', () => {
      const result = isQueryAllowed('TRUNCATE TABLE users');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('TRUNCATE');
    });

    it('should block GRANT statements', () => {
      const result = isQueryAllowed('GRANT ALL ON users TO hacker');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('GRANT');
    });

    it('should block COPY statements (PostgreSQL specific)', () => {
      const result = isQueryAllowed('COPY users TO \'/tmp/data.csv\'');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('COPY');
    });

    it('should block EXECUTE statements', () => {
      const result = isQueryAllowed('EXECUTE some_prepared_statement');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('EXECUTE');
    });

    it('should block INTO keyword (SELECT INTO)', () => {
      const result = isQueryAllowed('SELECT * INTO new_table FROM users');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('INTO');
    });

    it('should block LOCK statements', () => {
      const result = isQueryAllowed('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('LOCK');
    });

    it('should not flag columns containing keywords', () => {
      expect(isQueryAllowed('SELECT updated_at, created_by, deleted FROM users').allowed).toBe(true);
      expect(isQueryAllowed('SELECT grant_date FROM permissions').allowed).toBe(true);
    });

    it('should detect keywords at word boundaries', () => {
      // "DELETE" as a word should be blocked
      const result = isQueryAllowed('SELECT * FROM users WHERE status = \'DELETE\'');
      expect(result.allowed).toBe(false);
    });

    it('should block queries not starting with SELECT/WITH', () => {
      expect(isQueryAllowed('EXPLAIN SELECT * FROM users').allowed).toBe(false);
      expect(isQueryAllowed('ANALYZE users').allowed).toBe(false);
      expect(isQueryAllowed('VACUUM users').allowed).toBe(false);
    });
  });

  describe('Combined Security', () => {
    it('should handle complex but safe queries', () => {
      const safeQuery = `
        WITH recent_users AS (
          SELECT id, name, email, created_at
          FROM users
          WHERE created_at > NOW() - INTERVAL '30 days'
        )
        SELECT u.id, u.name, COUNT(o.id) as order_count
        FROM recent_users u
        LEFT JOIN orders o ON o.user_id = u.id
        GROUP BY u.id, u.name
        ORDER BY order_count DESC
        LIMIT 10
      `;
      expect(isQueryAllowed(safeQuery).allowed).toBe(true);
    });

    it('should block injection attempts in complex queries', () => {
      const maliciousQuery = `
        SELECT * FROM users
        WHERE id = 1; DROP TABLE users; --
      `;
      expect(isQueryAllowed(maliciousQuery).allowed).toBe(false);
    });

    it('should handle JSON/JSONB operations safely', () => {
      const jsonQuery = `SELECT data->>'name' as name FROM users WHERE data @> '{"active": true}'`;
      expect(isQueryAllowed(jsonQuery).allowed).toBe(true);
    });
  });
});
