import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

async function run() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();
    const users = await db.collection("users").find({}).toArray();
    console.log("Users in MongoDB:", users.map(u => ({ id: u._id, username: u.username, displayName: u.displayName })));
    await client.close();
}
run();
