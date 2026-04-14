import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService,PrismaService,ConfigService],
})
export class ProfileModule {}
