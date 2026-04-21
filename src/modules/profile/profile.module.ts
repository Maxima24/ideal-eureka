import { Module } from '@nestjs/common';
import { ProfilesService } from './profile.service';
import { ProfilesController } from './profile.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService,PrismaService,ConfigService],
})
export class ProfileModule {}
