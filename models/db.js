/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/
import { Sequelize } from 'sequelize';

const dbName = process.env.DB_NAME || 'Supplier';
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 3306;

export const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'mysql',
    logging: false,
    timezone: '+08:00', // Philippine Standard Time
    pool: {
        max: 15,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    define: {
        timestamps: true,
        underscored: false,
        freezeTableName: false
    }
});
