const { Client } = require('pg');

const client = new Client({
    user: 'postgres.wdoufytgiklggsizggia',
    host: 'aws-0-us-west-2.pooler.supabase.com',
    database: 'postgres',
    password: 'Adsnap955167',
    port: 6543,
    ssl: {
        rejectUnauthorized: false
    }
});

client.connect()
    .then(() => {
        console.log('Successfully connected to the database');
        return client.end();
    })
    .catch(err => {
        console.error('Connection error', err.stack);
    });

