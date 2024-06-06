const express = require('express');
const morgan = require('morgan');
const mercadopago = require('mercadopago');
const cors = require('cors');
require("dotenv").config();
const functions = require('./funciones')
const server = express();

server.use(express.json());
server.use(morgan('dev'));
server.use(cors());

server.get('/paymentStatus/:mpId', functions.paymentStatus)

server.post('/payment', functions.payment)

server.listen(3001, () => {
    console.log('servidor en puerto 3001');
})