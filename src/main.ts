import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/globale-filter';
import  cookieParser from "cookie-parser"

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser())
  app.enableCors({origin:"http://localhost:3000",
    credentials:true
  })
  app.useGlobalFilters( new GlobalExceptionFilter())
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();



