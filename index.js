require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;

app.get('/', async (req, res)=>{
    res.send({
        status: 200,
        message: "hello server...."
    })
})

app.listen(port, ()=>{
    console.log(`server running on port: ${port}`)
})
