import { Injectable,OnModuleInit,OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {PrismaClient} from "@prisma/client"
import {Pool} from "pg"
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit,OnModuleDestroy  {

constructor(configService:ConfigService){
    const pool = new Pool({
        connectionString: configService.get<string>("DATABASE_URL")!
    })
    const adapter = new PrismaPg(pool)
    super({
        adapter
    })
}

    async onModuleInit() {
        await this.$connect()
    }
    async onModuleDestroy() {
        await this.$disconnect()
    }

    async checkHealth(){
        const start = Date.now()
        try{
              await this.$queryRaw`SELECT 1;`;

        return {
            service:"Prisma",
            status:"up",
            message:"Prisma service is up",
            duration: Date.now()
        }

        }catch(err){
            return {
                status:"Down",
                message:"Prisma service down",
                service:"Prisma"
            }
        }
      
    }
}
