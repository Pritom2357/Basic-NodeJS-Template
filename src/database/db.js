const dotenv = require('dotenv');
const pkg = require('pg');
const {Pool} = pkg;
const path = require('path');

// dotenv.config({path: path.resolve(__dirname, '../../.env')});

class DB_Connection{
    static #instance;
    pool;
    
    constructor(){
        if(DB_Connection.#instance){
            return DB_Connection.#instance;
        }

        // console.log('Database URL:', process.env.DATABASE_URL);
        
        const connectionConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: false
        };

        this.pool = new Pool(connectionConfig);
        DB_Connection.#instance = this;
    }
    
    static getInstance(){
        if(!DB_Connection.#instance){
            DB_Connection.#instance = new DB_Connection();
        }

        return DB_Connection.#instance;
    }

    query_executor = async(query, params=[])=>{
        const start = Date.now();
        const client = await this.pool.connect();
        try {
            const result = await client.query(query, params);
            if(process.env.LOG_SQL === 'true'){
                console.log(`[SQL ${Date.now()-start}ms] rows=${result.rowCount} :: ${query.split('\n').join(' ')}`);
                if(params.length) console.log('  params:', params);
            }
            return result;
        } catch (error) {
            console.log("Error executing database query: " + error.message);
            throw error; 
        } finally{
            client.release();
        }
    }
}

module.exports = DB_Connection;
