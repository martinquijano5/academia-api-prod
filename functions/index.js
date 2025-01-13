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
        materia ${req.body.materia} porque no se pago dentro de 60'</p>  
        <br/>
        <p> Esperamos verte en una clase pronto! </p>`,
    },
  };
  let count = 1;
  const interval = setInterval(async () => {
    const reserva = admin.firestore().collection("reservas")
        .doc(req.body.id);
    reserva.get()
        .then((snapshot) => {
          if (snapshot.exists) {
            const datos = snapshot.data();
            if (datos.idMercadoPago === undefined) {
              if (count >= 60) {
                clearInterval(interval);
                reserva.delete().then(()=>{
                  const options = {
                    method: "POST",
                    headers:
                      {"Content-Type": "application/json",
                        "Authorization": req.body.auth,
                      },
                    body: JSON.stringify(
                        {"reason": "no se pago dentro de los 10' validos"}),
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

exports.paymentProd = functions.https.onRequest(async (req, res) => {
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
  const client = new MercadoPagoConfig({accessToken: req.body.key});
  const preference = new Preference(client);

  preference.create({
    body: {
      items: [{
        title: req.body.title,
        currency_id: "ARS",
        picture_url: req.body.image,
        description: req.body.description,
        category_id: "art",
        unit_price: req.body.price,
        quantity: 1,
      }],
      back_urls: {
        success: `https://tuni.com.ar/paymentOk/${req.body.firebaseId}/${req.body.calendlyId}`, //aca manda al usuario una vez realizado el pago
        failure: "https://tuni.com.ar/miPerfil",
        pending: "",
      },
      auto_return: "approved",
      notification_url: `https://us-central1-prueba-2e666.cloudfunctions.net/paymentOk?firebaseId=${req.body.firebaseId}&calendlyId=${req.body.calendlyId}&profesorId=${req.body.profesorId}`, // aca manda un request http cuando se realiza el pago
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
//paymentProd genera el pago



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

exports.paymentOk = functions.https.onRequest(async (req, res) => {
  // Configurar CORS headers para permitir solicitudes desde cualquier origen
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Verificar si es una solicitud de tipo OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const queryParams = new URLSearchParams(req.url);
  const paramsObject = {};
  for (const [key, value] of queryParams.entries()) {
    paramsObject[key] = value;
  }
  if (paramsObject.type === "payment") {
    console.log(paramsObject);
    console.log("calendlyId: ", paramsObject["/?calendlyId"]);
    console.log("firebaseId: ", paramsObject.firebaseId);
    console.log("id: ", paramsObject["data.id"]);
    console.log("type: ", paramsObject.type);
    try {
      const usuario = admin.firestore().collection("users")
          .doc(paramsObject.firebaseId);
      usuario.get()
          .then((snapshot) => {
            if (snapshot.exists) {
              console.log("Encontre el documento");
              const datos = snapshot.data();
              const array = datos.reservas;
              const index = array.findIndex((element) =>
                element.idCalendly == paramsObject["/?calendlyId"]);
              console.log(index, "posCalendlyt");
              if (index !== -1) {
                console.log("Encontre la reserva");
                console.log("Encontre los profesores");
                if (array[index].idMercadoPago && array[index].idMercadoPago > 0) {
                  array[index].idMercadoPago = paramsObject["data.id"];
                  const newArr = array.filter((elm) => elm.idCalendly !=
                    paramsObject.calendlyId);
                  newArr.push(
                      {
                        idCalendly: array[index].idCalendly,
                        idMercadoPago: array[index].idMercadoPago,
                        info: array[index].info,
                        idPreferenceMercadoPago:
                          array[index].idPreferenceMercadoPago,
                      });
                  console.log(newArr);
                  usuario.update({reservas: newArr})
                      .then(() => {
                        admin.firestore().collection("info").get()
                            .then((info) => {
                              const profesores = info.docs[0].data().profesores;
                              const profeSel = profesores.filter((prof) => prof.nombre === array[index].info.profesor);
                              const direccionProfesor = profeSel[0].email;
                              const direcionAlumno = datos.owner;
                              const nombreAlumno = datos.name + " " + datos.surname;
                              const data = array[index].info;
                              const emailProfesor = {
                                to: direccionProfesor,
                                message: {
                                  subject: "Reserva confirmada",
                                  html: `
                                  <h1>Reserva confirmada</h1>
                                  <br/>
                                  <p> El alumno ${nombreAlumno} confirmo la clase del dia ${data.fechaText} de la materia ${data.materia}. Los temas a ver son ${data.temas} </p>
                                  <br/>
                                  <button><a href=${data.meet} target="_blank">Ir al meet</a></button>
                                  `,
                                },
                              };
                              const emailAlumno = {
                                to: direcionAlumno,
                                message: {
                                  subject: `Reserva confirmada para tu clase de ${data.materia}`,
                                  html: `
                                  <p> Hola ${nombreAlumno} </p>
                                  <br/>
                                  <p> Tu clase particular con ${data.profesor} para la materia ${data.materia} ha sido confirmada con exito! La clase esta programada para el ${data.fechaText}. Podes acceder a la clase <a href=${data.meet} target="_blank">a traves de este link</a>. </p>  
                                  <br/>
                                  <p> ¡Gracias por confiar en nosotros para tu aprendizaje! Si necesitas otra alternativa o tenes alguna pregunta, no dudes en dejarnos un <a href="wa.me/5491135004141"> mensaje por whatsapp </a>  o respondiendo este mail. </p>
                                  <br/>
                                  <p> Nos vemos en clase! </p>
                                  `,
                                },
                              };
                              admin.firestore().collection("mails").add(emailAlumno)
                                  .then(() => admin.firestore().collection("mails").add(emailProfesor))
                                  .then(() => res.status(200));
                            });
                      });
                }
              } else {
                res.status(500).json({error: "La reserva no existe"});
              }
            } else {
              res.status(500).json({error: "El documento no existe"});
            }
          });
    } catch (error) {
      console.error(error);
      res.status(500).json({error: "Error al obtener el estado del pago"});
    }
  }
  res.status(200).send("Payment received and logged successfully.");
});



exports.generateOneTimeCalendlyLink = functions.https.onRequest(async (req,res) => {
  let firebaseId;
  let calendlyId;
  let profesorId;

  //paso 1 llamar a la bd para obtener el documento de id profesorId

  //paso 2 llamar a la api con bearer y link_scheduling

  //paso 3 return booking_url de response de api

})