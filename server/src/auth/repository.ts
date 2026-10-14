import type { Queryable } from '../db/driver.js';

export type Challenge = { nonce: string; wallet: string; message: string; expiresAt: Date };
export type Session = {
  tokenHash: string;
  wallet: string;
  csrf: string;
  expiresAt: Date;
  origin: string;
};
export interface AuthRepository {
  putChallenge(challenge: Challenge): Promise<void>;
  challenge(nonce: string, now: Date): Promise<Challenge | undefined>;
  consume(nonce: string, now: Date): Promise<boolean>;
  putSession(session: Session): Promise<void>;
  session(hash: string, now: Date): Promise<Session | undefined>;
  revoke(hash: string): Promise<void>;
}
export class MemoryAuthRepository implements AuthRepository {
  private challenges = new Map<string, Challenge>();
  private sessions = new Map<string, Session>();
  async putChallenge(c: Challenge) {
    for (const [key, value] of this.challenges)
      if (value.expiresAt <= new Date()) this.challenges.delete(key);
    this.challenges.set(c.nonce, c);
  }
  async challenge(nonce: string, now: Date) {
    const c = this.challenges.get(nonce);
    return c && c.expiresAt > now ? c : undefined;
  }
  async consume(nonce: string, now: Date) {
    if (!(await this.challenge(nonce, now))) return false;
    return this.challenges.delete(nonce);
  }
  async putSession(s: Session) {
    for (const [key, value] of this.sessions)
      if (value.expiresAt <= new Date()) this.sessions.delete(key);
    this.sessions.set(s.tokenHash, s);
  }
  async session(hash: string, now: Date) {
    const s = this.sessions.get(hash);
    return s && s.expiresAt > now ? s : undefined;
  }
  async revoke(hash: string) {
    this.sessions.delete(hash);
  }
}
export class PostgresAuthRepository implements AuthRepository {
  constructor(private db: Queryable) {}
  async putChallenge(c: Challenge) {
    await this.db.query('DELETE FROM auth_nonces WHERE expires_at <= $1', [new Date()]);
    await this.db.query(
      'INSERT INTO auth_nonces(nonce,wallet_address,message,expires_at) VALUES($1,$2,$3,$4)',
      [c.nonce, c.wallet, c.message, c.expiresAt],
    );
  }
  async challenge(nonce: string, now: Date) {
    const { rows } = await this.db.query<{
      nonce: string;
      wallet_address: string;
      message: string;
      expires_at: string;
    }>(
      'SELECT nonce,wallet_address,message,expires_at FROM auth_nonces WHERE nonce=$1 AND used_at IS NULL AND expires_at>$2',
      [nonce, now],
    );
    const c = rows[0];
    return c
      ? {
          nonce: c.nonce,
          wallet: c.wallet_address,
          message: c.message,
          expiresAt: new Date(c.expires_at),
        }
      : undefined;
  }
  async consume(nonce: string, now: Date) {
    const result = await this.db.query(
      'UPDATE auth_nonces SET used_at=$2 WHERE nonce=$1 AND used_at IS NULL AND expires_at>$2 RETURNING nonce',
      [nonce, now],
    );
    return result.rows.length === 1;
  }
  async putSession(s: Session) {
    await this.db.query('DELETE FROM auth_sessions WHERE expires_at <= $1', [new Date()]);
    await this.db.query(
      'INSERT INTO auth_sessions(token_hash,wallet_address,csrf_token,expires_at,origin) VALUES($1,$2,$3,$4,$5)',
      [s.tokenHash, s.wallet, s.csrf, s.expiresAt, s.origin],
    );
  }
  async session(hash: string, now: Date) {
    const { rows } = await this.db.query<{
      token_hash: string;
      wallet_address: string;
      csrf_token: string;
      expires_at: string;
      origin: string;
    }>('SELECT * FROM auth_sessions WHERE token_hash=$1 AND expires_at>$2', [hash, now]);
    const s = rows[0];
    return s
      ? {
          tokenHash: s.token_hash,
          wallet: s.wallet_address,
          csrf: s.csrf_token,
          expiresAt: new Date(s.expires_at),
          origin: s.origin,
        }
      : undefined;
  }
  async revoke(hash: string) {
    await this.db.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]);
  }
}
