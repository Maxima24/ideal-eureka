import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/globale-filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({origin:"*"})
  app.useGlobalFilters( new GlobalExceptionFilter())
  app.enableCors({origin:"*"})
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
