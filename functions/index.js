const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {MercadoPagoConfig, Preference} = require("mercadopago");

admin.initializeApp();
// esta es la funcion que hace que si no paga en 15 mins se cancele la reserva
exports.actualizarEstadoPago = functions.https.onRequest((req, res) => {
  // Configurar CORS headers para permitir solicitudes desde cualquier origen
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Verificar si es una solicitud de tipo OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // Resto de tu lógica de la función aquí
  if (!req.headers.authorization) {
    res.status(403).json({error: "No autenticado"});
    return;
  }

  const emailAlumno = {
    to: req.body.user,
    message: {
      subject: "Reserva cancelada",
      html:
      `<h1>Reserva cancelada</h1>
        <br/>
        <p> La reserva de la clase del dia ${req.body.date} de la
        materia ${req.body.materia} porque no se pago dentro de 15'</p>  
        <br/>
        <p> Esperamos verte en una clase pronto! </p>`,
    },
  };
  let count = 1;
  const interval = setInterval(async () => {
    const usuario = admin.firestore().collection("users")
        .doc(req.body.id);
    usuario.get()
        .then((snapshot) => {
          if (snapshot.exists) {
            const datos = snapshot.data();
            const reserva = datos.reservas.filter((res) => {
              return res.idCalendly == req.body.calendlyId;
            });
            if (reserva[0].idMercadoPago === undefined) {
              if (count >= 3) {
                clearInterval(interval);
                const resAct = datos.reservas.filter((res) => {
                  return res.idCalendly != req.body.calendlyId;
                });
                usuario.update({reservas: resAct}).then(()=>{
                  const options = {
                    method: "POST",
                    headers:
                      {"Content-Type": "application/json",
                        "Authorization": req.body.auth,
                      },
                    body: JSON.stringify(
                        {"reason": "no se pago dentro de los 15' validos"}),
                  };
                  fetch(`https://api.calendly.com/scheduled_events/${req.body.calendlyId}/cancellation`, options)
                      .then(()=> {
                        admin.firestore().collection("mails").add(emailAlumno)
                            .then((res) => console.log(res))
                            .catch((err)=> console.log(err));
                      })
                      .catch((err)=> console.log(err));
                });
              }
            } else {
              console.log(reserva, "hecho");
              clearInterval(interval);
            }
          } else {
            console.log("El documento no existe");
          }
        }).catch((error) => {
          console.log(error);
        });
    count += 1;
  }, 60000);

  res.status(200).send("Proceso completado");
});

/**
 * Te da la key de mp en base al id del profesor.
 * @param {number} id - The ID to determine which key to retrieve.
 * @return {string} The retrieved key.
 */
function obtenerKey(id) {
  switch (id) {
    case 0:
      return functions.config().keys[id].key_prod;
    case 1:
      return functions.config().keys[id].key_prod;
    case 2:
      return functions.config().keys[id].key_prod;
  }
}

exports.payment = functions.https.onRequest(async (req, res) => {
  // Configurar CORS headers para permitir solicitudes desde cualquier origen
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Verificar si es una solicitud de tipo OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  // Resto de tu lógica de la función aquí
  if (!req.headers.authorization) {
    res.status(403).json({error: "No autenticado"});
    return;
  }
  console.log("el id del profesor es " + req.body.profesorElegidoId);
  const key = obtenerKey(req.body.profesorElegidoId);
  console.log("la key del profesor es " + key);
  const client = new MercadoPagoConfig({accessToken: key});
  const preference = new Preference(client);

  preference.create({
    body: {
      items: [{
        title: req.body.title,
        currency_id: "ARS",
        picture_url: req.body.image,
        description: req.body.description,
        category_id: "art",
        unit_price: 0.01,
        quantity: 1,
      }],
      back_urls: {
        success: `http://localhost:3000/paymentOk/${req.body.firebaseId}/${req.body.calendlyId}`,
        failure: "http://localhost:3000/miPerfil",
        pending: "",
      },
      auto_return: "approved",
      binary_mode: true,
    },
  })
      .then((response) => {
        console.log(response);
        res.status(200).send({response});
      }).catch((err) => {
        console.log(err);
      });
});

exports.checkPayment = functions.https.onRequest(async (req, res) => {
  // Configurar CORS headers para permitir solicitudes desde cualquier origen
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Verificar si es una solicitud de tipo OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // Resto de tu lógica de la función aquí
  if (!req.headers.authorization) {
    res.status(403).json({error: "No autenticado"});
    return;
  }

  console.log(req.body);

  try {
    const response = await axios.get(
        `https://api.mercadopago.com/v1/payments/${req.body.mpId}`,
        {
          headers: {
            Authorization: req.body.Authorization,
          },
        },
    );
    console.log(response);
    const data = response.data.status;
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({error: "Error al obtener el estado del pago"});
  }
});

