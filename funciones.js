const axios = require('axios');
const mercadopago = require('mercadopago');
//const firebase = require('firebase');


mercadopago.configure({
  access_token: process.env.MERCADOPAGO_KEY_TEST,
});

const functions = {
    payment: (req,res) => {
        const prod = req.body
        console.log(prod);
        let preference = {
            items: [{
                id: prod.calendlyId,
                title: prod.title,
                currency_id: 'ARS',
                picture_url: prod.image,
                description: prod.description,
                category_id: 'art',
                unit_price: 0.01, /*prod.price*/
                quantity: 1,
            }],
            back_urls: {
                success: `http://localhost:3000/paymentOk/${prod.firebaseId}/${prod.calendlyId}`,
                failure: 'http://localhost:3000/miPerfil',
                pending: ''
            },
            auto_return: 'approved',
            binary_mode: true
        }
        mercadopago.preferences.create(preference)
        .then((response) => res.status(200).send({response}))
        .catch((error)=> res.status(400).send({error: error}))
    },
    paymentStatus: async (req, res) => {
        try {
          console.log("ruta de status de pago");
          console.log(req.params.mpId);
          
          const response = await axios.get(
            `https://api.mercadopago.com/v1/payments/${req.params.mpId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.MERCADOPAGO_KEY_TEST}`
              }
            }
          );
          
          const data = response.data.status;
          // Hacer algo con los datos obtenidos de Mercado Pago
          res.json(data);
        } catch (error) {
          // Manejar el error
          console.error(error);
          res.status(500).json({ error: 'Error al obtener el estado del pago desde Mercado Pago' });
        }
    }
}

module.exports = functions;

