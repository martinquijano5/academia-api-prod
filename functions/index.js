const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {MercadoPagoConfig, Preference} = require("mercadopago");
const cors = require('cors')({ origin: true });

// Function to format date in Spanish for Argentina timezone
function formatFechaHora(fechaHoraISO) {
  if (!fechaHoraISO) return "fecha no disponible";
  
  // Create date object without timezone adjustment
  const date = new Date(fechaHoraISO);
  
  // Days of the week in Spanish
  const diasSemana = [
    "Domingo", "Lunes", "Martes", "Miércoles", 
    "Jueves", "Viernes", "Sábado"
  ];
  
  // Months in Spanish
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
    "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  
  // Format the components
  const diaSemana = diasSemana[date.getDay()];
  const dia = date.getDate();
  const mes = meses[date.getMonth()];
  const anio = date.getFullYear();
  const hora = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  
  // Return formatted string
  return `${diaSemana} ${dia} de ${mes} de ${anio} a las ${hora}:${minutos}`;
}

// Helper function to get professor's mpKey by email
async function getProfessorMpKey(email) {
  const profesorKeyQuery = await admin.firestore()
    .collection("profesoresKeyMp")
    .where("email", "==", email)
    .limit(1)
    .get();
  
  if (profesorKeyQuery.empty) {
    throw new functions.https.HttpsError(
      'not-found', 
      `No MercadoPago key found for professor: ${email}`
    );
  }
  
  const profesorKeyDoc = profesorKeyQuery.docs[0];
  const mpKey = profesorKeyDoc.data().mpKey;
  
  if (!mpKey) {
    throw new functions.https.HttpsError(
      'failed-precondition', 
      `MercadoPago key is empty for professor: ${email}`
    );
  }
  
  return mpKey;
}

// Email template function for consistent styling
function mailingTemplate({ 
  title = null, 
  content = null, 
  h3Title = null, 
  h3Content = [null, null, null],
  buttonText = null,
  buttonLink = null,
}) {
  const hasH3Block = h3Title && h3Content && h3Content.some(item => item);

  return (
      `<!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
              <tr>
                  <td align="center" style="padding: 20px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e0e0e0;">
                          
                          <!-- Header with Logo -->
                          <tr>
                              <td align="center" style="padding: 25px 0; background-color: #ffffff;">
                                  <img src="https://www.tuni.com.ar/Tuni.png" alt="TUNI Logo" width="180" style="max-width: 180px; height: auto; display: block;">
                              </td>
                          </tr>
                          
                          <!-- Main Content -->
                          <tr>
                              <td style="padding: 30px; background-color: #ffffff;">
                                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <!-- Title -->
                                      <tr>
                                          <td align="center" style="padding-bottom: 20px;">
                                              <h1 style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: bold; color: #1a78f2; text-align: center; line-height: 1.2;">
                                                  ${title}
                                              </h1>
                                          </td>
                                      </tr>
                                      
                                      <!-- Content -->
                                      ${content ? `
                                      <tr>
                                          <td style="padding-bottom: 20px;">
                                              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #1a2942;">
                                                  ${content}
                                              </p>
                                          </td>
                                      </tr>
                                      ` : ''}
                                      
                                      <!-- Highlighted Box -->
                                      ${hasH3Block ? `
                                      <tr>
                                          <td style="padding: 20px 0;">
                                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border: 1px solid #e9ecef;">
                                                  <tr>
                                                      <td style="padding: 25px;">
                                                          <h3 style="margin: 0 0 15px 0; font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; color: #1a2942; text-align: center;">
                                                              ${h3Title}
                                                          </h3>
                                                          ${h3Content.filter(item => item).map(item => `
                                                          <p style="margin: 10px 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1a2942; text-align: center;">
                                                              ${item}
                                                          </p>
                                                          `).join('')}
                                                      </td>
                                                  </tr>
                                              </table>
                                          </td>
                                      </tr>
                                      ` : ''}
                                      
                                      <!-- Button -->
                                      ${buttonText && buttonLink ? `
                                      <tr>
                                          <td align="center" style="padding: 30px 0 20px 0;">
                                              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                  <tr>
                                                      <td style="background-color: #1a78f2;">
                                                          <a href="${buttonLink}" target="_blank" style="display: inline-block; padding: 18px 35px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">
                                                              ${buttonText}
                                                          </a>
                                                      </td>
                                                  </tr>
                                              </table>
                                          </td>
                                      </tr>
                                      ` : ''}
                                      
                                      <!-- Closing Messages -->
                                      <tr>
                                          <td align="center" style="padding-top: 20px;">
                                              <p style="margin: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; color: #1a2942;">
                                                  Nos vemos en clase
                                              </p>
                                              <p style="margin: 5px 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #1a78f2;">
                                                  ¡Stay Tunied!
                                              </p>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                              <td style="padding: 25px; background-color: #f8f9fa; border-top: 1px solid #e9ecef;">
                                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                      <tr>
                                          <td align="center" style="padding-bottom: 15px;">
                                              <a href="https://www.instagram.com/tuni.academy" target="_blank" style="margin: 0 10px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a78f2; text-decoration: none; font-weight: bold;">Instagram</a>
                                              <span style="margin: 0 5px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #555555;">|</span>
                                              <a href="https://www.tuni.com.ar/" target="_blank" style="margin: 0 10px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a78f2; text-decoration: none; font-weight: bold;">Página web</a>
                                              <span style="margin: 0 5px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #555555;">|</span>
                                              <a href="https://wa.me/5491135004141" target="_blank" style="margin: 0 10px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a78f2; text-decoration: none; font-weight: bold;">WhatsApp</a>
                                          </td>
                                      </tr>
                                      <tr>
                                          <td align="center">
                                              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #555555;">
                                                  © 2025 TUNI
                                              </p>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </body>
      </html>`
  )
}

admin.initializeApp();

exports.paymentOkNueva = functions.https.onRequest(async (req, res) => {
  console.log("arranco");
  
  // Extract notification type
  const notificationType = req.query.topic || (req.body && req.body.action && req.body.action.split('.')[0]);
  console.log("Notification type:", notificationType);
  
  // Only process payment notifications and ignore duplicates
  if (notificationType !== "payment") {
    console.log(`Ignoring ${notificationType} notification`);
    res.status(200).send("OK");
    return;
  }
  
  // Extract payment ID from different possible sources
  const paymentId = req.query.id || (req.query['data.id']) || (req.body && req.body.data && req.body.data.id) ||(req.body && req.body.resource);
                   
  // Extract MP key
  const mpKey = req.query.mpKey;
  
  if (!paymentId || !mpKey) {
    console.log("Missing payment ID or MP key");
    res.status(400).send("Missing required parameters");
    return;
  }
  
  try {
    // Create a document reference with just the paymentId as the document ID
    // This ensures we can't create duplicate documents for the same payment
    const reservationRef = admin.firestore().collection("reservas").doc(paymentId);
    
    // Check if the document already exists
    const docSnapshot = await reservationRef.get();
    
    if (docSnapshot.exists) {
      console.log(`Reservation for payment ${paymentId} already exists. Skipping duplicate notification.`);
      res.status(200).send("OK - Duplicate notification ignored");
      return;
    }
    
    // Get payment details from Mercado Pago using Axios
    const paymentResponse = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${mpKey}`
        }
      }
    );
    
    const paymentDetails = paymentResponse.data;
    
    // Extract metadata from payment
    const metadata = paymentDetails.metadata || {};
    
    console.log("Full payment details:", JSON.stringify(paymentDetails));
    console.log("Full metadata:", JSON.stringify(metadata));
    
    // STEP 2: Generate Calendly link
    let calendlyBookingUrl = null;
    try {
      if (!metadata.profesor.auth_calendly || !metadata.profesor.link_scheduling) {
        throw new Error("Missing Calendly credentials in metadata");
      }
      
      const calendlyResponse = await axios.post(
        'https://api.calendly.com/scheduling_links',
        {
          "max_event_count": "1",
          "owner": metadata.profesor.link_scheduling,
          "owner_type": "EventType"
        },
        {
          headers: {
            'Authorization': `Bearer ${metadata.profesor.auth_calendly}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      calendlyBookingUrl = calendlyResponse.data.resource.booking_url;
    } catch (calendlyError) {
      console.log("Error creating Calendly scheduling link:", calendlyError);
      // We continue even if Calendly fails, but with null booking URL
    }
    
    // Step 3: Create reservation document in Firestore
    const reservaData = {
      link_scheduling_calendly: calendlyBookingUrl,
      idMercadoPago: paymentId,
      profesor: metadata.profesor.email,
      user: metadata.usuario.mail,
      info: {
        duracion: 90,
        fecha: metadata.fecha_hora || " ",
        materia: metadata.materia || " ",
        meet: " ", // Will be populated after Calendly confirmation
        nameEstudiante: metadata.usuario.nombre || " ",
        nameProfe: metadata.profesor.nombre || " ",
        estadoReserva: "pagado",
        temas: " ",  // Will be populated after Calendly confirmation
        video: " ",
        createdAt: Date.now(),
        precio: metadata.price || " ",
        cantAlumnos: metadata.cant_alumnos || 1,
        universidad: metadata.universidad.codigo || " ",
        carrera: `${metadata.carrera.codigo_universidad} ${metadata.carrera.nombre}` || " ",
      }
    };   
    
    // Create the document with the payment ID as the document ID
    await reservationRef.set(reservaData);
    console.log(`Reservation created with ID: ${paymentId}`);
    
    // Step 4: Send confirmation email to the user
    try {
      const emailAlumno = {
        to: metadata.usuario.mail,
        message: {
          subject: `Reserva pagada para tu clase de ${metadata.materia}`,
          html: mailingTemplate({
            title: "¡Pago confirmado!",
            content: `Hola ${metadata.usuario.nombre || "Estudiante"}! Tu pago para la clase de ${metadata.materia} del día ${formatFechaHora(metadata.fecha_hora)} ha sido confirmado.`,
            h3Title: "Próximo paso",
            h3Content: [
              "Para confirmar tu reserva, hacé clic en el botón de abajo",
              "Una vez confirmada la reserva, recibirás un correo con el enlace para unirte a la clase",
              "Si ya confirmaste la reserva, no es necesario que ingreses al enlace nuevamente"
            ],
            buttonText: "Confirmar reserva",
            buttonLink: `http://tuni.com.ar/confirmarReserva/?payment_id=${paymentId}&status=approved`
          })
        },
      };
      
      await admin.firestore().collection("mails").add(emailAlumno);
    } catch (emailError) {
      console.log("Error sending confirmation email:", emailError);
      // Continue execution even if email fails
    }
    
    console.log('fin, todo ok');
    res.status(200).send("OK");
  } catch (error) {
    console.log("Error processing payment:", error);
    res.status(500).send("Error processing payment");
  }
});

exports.paymentProdNuevaV2 = functions.https.onCall(async (data, context) => {
  console.log("paymentProdNuevaV2 called with data:", data);
  
  try {
    // Get the mpKey from the database using helper function
    const mpKey = await getProfessorMpKey(data.profesor.email);
    
    // Initialize MercadoPago with the professor's key from database
    const client = new MercadoPagoConfig({accessToken: mpKey});
    const preference = new Preference(client);

    // Create preference data
    const preferenceData = {
      body: {
        items: [{
          title: `Clase particular Tuni`,
          currency_id: "ARS",
          picture_url: "https://www.tuni.com.ar/Tuni.svg",
          description: `Clase particular con ${data.profesor.nombre} para la materia ${data.materia}`,
          category_id: "art",
          unit_price: Number(data.price),
          quantity: 1,
        }],
        back_urls: {
          success: `https://tuni.com.ar/confirmarReserva/`,
          failure: "https://tuni.com.ar/reservar",
          pending: "https://tuni.com.ar/reservar",
        },
        auto_return: "approved",
        notification_url: `https://us-central1-prueba-2e666.cloudfunctions.net/paymentOkNueva?mpKey=${mpKey}`,
        binary_mode: true,
        metadata: data,
        // Exclude cash payment methods
        payment_methods: {
          excluded_payment_methods: [
            { id: "cash" },
            { id: "ticket" },
            { id: "atm" },
            { id: "bank_transfer" },
            { id: "pagofacil" },
            { id: "rapipago" }
          ],
          excluded_payment_types: [
            { id: "ticket" },
            { id: "atm" }
          ]
        }
      },
    };
    
    console.log('Creating MercadoPago preference with data:', preferenceData);
    
    // Create the preference in MercadoPago
    const response = await preference.create(preferenceData);
    console.log('MercadoPago response:', response);
    
    // Return the response to the client
    return {
      success: true,
      response: response
    };
  } catch (error) {
    console.error("Function error:", error);
    
    // Return a proper error that can be handled by the client
    throw new functions.https.HttpsError(
      'internal', 
      error.message || 'Unknown error occurred',
      { details: error.toString() }
    );
  }
});

exports.getAllUserss = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  return cors(req, res, async () => {
    try {
      const usersList = [];
      let pageToken = undefined;
      
      // Handle pagination to get all users
      do {
        const listUsersResult = await admin.auth().listUsers(1000, pageToken);
        
        // Extract only email and displayName for each user
        listUsersResult.users.forEach(userRecord => {
          usersList.push({
            email: userRecord.email,
            displayName: userRecord.displayName || null
          });
        });
        
        pageToken = listUsersResult.pageToken;
      } while (pageToken);
      
      res.status(200).json({ users: usersList });
    } catch (error) {
      console.error("Error listing users:", error);
      res.status(500).json({ 
        error: "Error retrieving users",
        details: error.toString() 
      });
    }
  });
});