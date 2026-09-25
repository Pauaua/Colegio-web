// Se ejecuta antes de cada archivo de prueba: usa la base local (docker compose) y silencia los logs.
process.env.NODE_ENV = 'test';
process.env.LOG_FILE = '';
