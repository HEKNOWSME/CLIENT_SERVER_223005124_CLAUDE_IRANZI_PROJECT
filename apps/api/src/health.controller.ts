import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@pmrms/contracts';
import { Public } from './common/decorators';
import { PrismaService } from './prisma.service';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'API process liveness (does not query the database)' })
  live() { return { service: 'pmrms-api', status: 'ok' }; }

  @Get()
  @ApiOperation({ summary: 'Readiness: query PostgreSQL through Prisma and check the setup marker' })
  @ApiResponse({ status: 200, description: 'API, migrations and seed are ready.' })
  @ApiResponse({ status: 503, description: 'Database unavailable or setup incomplete.' })
  async readiness(): Promise<HealthResponse> {
    const base = { service: 'pmrms-api' as const, checkedAt: new Date().toISOString() };
    let seeded: boolean;
    try {
      seeded = Boolean(await this.prisma.systemCheck.findUnique({ where: { id: 'local-setup' } }));
    } catch {
      throw new ServiceUnavailableException({ ...base, status: 'degraded', database: 'unavailable', setup: 'unavailable' });
    }
    if (!seeded) {
      throw new ServiceUnavailableException({ ...base, status: 'degraded', database: 'connected', setup: 'seed-required' });
    }
    return { ...base, status: 'ok', database: 'connected', setup: 'ready' };
  }
}
