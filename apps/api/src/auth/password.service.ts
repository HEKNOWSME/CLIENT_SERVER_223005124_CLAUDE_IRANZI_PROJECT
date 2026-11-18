import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library default) with the OWASP baseline: 19 MiB memory, 2 iterations, 1 lane.
export const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

@Injectable()
export class PasswordService {
  // Verified against when an email is unknown, so both paths cost one Argon2 verification.
  private readonly dummyHash = hash('pmrms-timing-equaliser-not-a-password', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async burnVerification(password: string): Promise<false> {
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
