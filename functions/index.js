const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {MercadoPagoConfig, Preference} = require("mercadopago");

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
    // Check if a reservation with this payment ID already exists
    const existingReservations = await admin.firestore()
      .collection("reservas")
      .where("idMercadoPago", "==", paymentId)
      .get();
    
    if (!existingReservations.empty) {
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
    
    // Use a transaction to ensure we don't create duplicates
    await admin.firestore().runTransaction(async (transaction) => {
      // Check again inside transaction if a reservation exists
      const reservationsRef = admin.firestore().collection("reservas");
      const snapshot = await transaction.get(
        reservationsRef.where("idMercadoPago", "==", paymentId)
      );
      
      if (!snapshot.empty) {
        console.log("Reservation already exists (checked in transaction)");
        return;
      }
      
      // Create new reservation
      const newReservationRef = reservationsRef.doc();
      transaction.set(newReservationRef, reservaData);
      console.log("Reservation created with ID:", newReservationRef.id);
    });
    
    // Step 4: Send confirmation email to the user
    try {
      const emailAlumno = {
        to: metadata.usuario.mail,
        message: {
          subject: `Reserva pagada para tu clase de ${metadata.materia}`,
          html: `
            <h1>Reserva pagada</h1>
            <br/>
            <p>Hola ${metadata.usuario.nombre || "Estudiante"},</p>
            <p>Tu pago para la clase de ${metadata.materia} del dia ${formatFechaHora(metadata.fecha_hora)} ha sido confirmado.</p>
            <p>Para confirmar tu reserva, por favor ingresa al siguiente enlace:</p>
            <p><a href=${`http://tuni.com.ar/confirmarReserva/?payment_id=${paymentId}&status=approved`}>Confirmar reserva</a></p>
            <p>Una vez confirmada la reserva, recibirás un correo de confirmación con el enlace para unirte a la clase.</p>
            <p>Si ya confirmaste la reserva, no es necesario que ingreses al enlace.</p>
            <br/>
            <p>¡Gracias por confiar en nosotros para tu aprendizaje!</p>
          `,
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

// Add this new function at the end of your file
exports.paymentProdNuevaV2 = functions.https.onCall(async (data, context) => {
  console.log("paymentProdNuevaV2 called with data:", data);
  
  try {
    // Initialize MercadoPago with the professor's key
    const client = new MercadoPagoConfig({accessToken: data.profesor.mpKey});
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
          success: `http://tuni.com.ar/confirmarReserva/`,
          failure: "https://tuni.com.ar/reservar",
          pending: "https://tuni.com.ar/reservar",
        },
        auto_return: "approved",
        notification_url: `https://us-central1-prueba-2e666.cloudfunctions.net/paymentOkNueva?mpKey=${data.profesor.mpKey}`,
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