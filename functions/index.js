const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {MercadoPagoConfig, Preference} = require("mercadopago");
const cors = require('cors')({ origin: true });

// Function to format date in Spanish for Argentina timezone
function formatFechaHora(fechaHoraISO) {
  if (!fechaHoraISO) return "fecha no disponible";
  
  // Parse the ISO string directly to avoid timezone conversion
  // fechaHoraISO format: "2025-07-30T17:00:00.000-03:00"
  const [datePart, timePart] = fechaHoraISO.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hourMinute] = timePart.split('.');
  const [hour, minute] = hourMinute.split(':').map(Number);
  
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
  
  // Create date for day of week calculation (using local timezone is OK for this)
  const dateForDayOfWeek = new Date(year, month - 1, day);
  const diaSemana = diasSemana[dateForDayOfWeek.getDay()];
  const mes = meses[month - 1];
  
  // Format time components
  const horaStr = hour.toString().padStart(2, '0');
  const minutosStr = minute.toString().padStart(2, '0');
  
  // Return formatted string
  return `${diaSemana} ${day} de ${mes} de ${year} a las ${horaStr}:${minutosStr}`;
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
        precioOriginal: metadata.original_price || metadata.price || " ",
        cantAlumnos: metadata.cant_alumnos || 1,
        universidad: metadata.universidad.codigo || " ",
        carrera: `${metadata.carrera.codigoUniversidad} ${metadata.carrera.nombre}` || " ",
        // Discount code information
        codigoDescuento: metadata.discount_code ? {
          codigo: metadata.discount_code.codigo,
          tipoDescuento: metadata.discount_code.tipo_descuento,
          valorDescuento: metadata.discount_code.valor_descuento,
          descuentoAplicado: metadata.discount_code.descuento_aplicado
        } : null
      }
    };   
    
    // Create the document with the payment ID as the document ID
    await reservationRef.set(reservaData);
    console.log(`Reservation created with ID: ${paymentId}`);
    
    // Step 3.5: Mark discount code as used if one was applied
    if (metadata.discount_code && metadata.discount_code.codigo) {
      try {
        const codigoQuery = await admin.firestore()
          .collection("codigos")
          .where("codigo", "==", metadata.discount_code.codigo.toUpperCase())
          .limit(1)
          .get();
        
        if (!codigoQuery.empty) {
          const codigoDoc = codigoQuery.docs[0];
          const codigoData = codigoDoc.data();
          
          // Increment usage count
          const currentTimestamp = Date.now();
          await codigoDoc.ref.update({
            vecesUsado: (codigoData.vecesUsado || 0) + 1,
            ultimoUso: currentTimestamp,
            // Add usage history
            historialUso: admin.firestore.FieldValue.arrayUnion({
              fecha: currentTimestamp,
              usuario: metadata.usuario.mail,
              reservaId: paymentId,
              montoDescuento: metadata.discount_code.descuento_aplicado
            })
          });
          
          console.log(`Discount code ${metadata.discount_code.codigo} marked as used`);
        }
      } catch (discountError) {
        console.error("Error updating discount code usage:", discountError);
        // Continue execution even if discount code update fails
      }
    }
    
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
    // Determine if this is a talleres or clases-particulares payment
    const isTalleres = data.tipoReserva === 'talleres';
    
    // Get the professor email based on the reservation type
    const professorEmail = isTalleres ? data.profesorMail : data.profesor.email;
    
    // Get the mpKey from the database using helper function
    const mpKey = await getProfessorMpKey(professorEmail);
    
    // Initialize MercadoPago with the professor's key from database
    const client = new MercadoPagoConfig({accessToken: mpKey});
    const preference = new Preference(client);

    // Set different URLs based on reservation type
    const backUrls = isTalleres ? {
      success: `https://tuni.com.ar/miperfil/`,
      failure: "https://tuni.com.ar/reservar",
      pending: "https://tuni.com.ar/reservar",
    } : {
      success: `https://tuni.com.ar/confirmarReserva/`,
      failure: "https://tuni.com.ar/reservar",
      pending: "https://tuni.com.ar/reservar",
    };

    const notificationUrl = isTalleres ? 
      `https://us-central1-prueba-2e666.cloudfunctions.net/paymentOkTalleres?mpKey=${mpKey}` :
      `https://us-central1-prueba-2e666.cloudfunctions.net/paymentOkNueva?mpKey=${mpKey}`;

    // Create different titles and descriptions based on type
    const title = isTalleres ? `Clases de Taller - Tuni` : `Clase particular - Tuni`;
    const description = isTalleres ? 
      `Clases del taller "${data.tallerNombre}" - ${data.selectedClases.length} clase(s)` :
      `Clase particular con ${data.profesor.nombre} para la materia ${data.materia}`;

    // Create preference data
    const preferenceData = {
      body: {
        items: [{
          title: title,
          currency_id: "ARS",
          picture_url: "https://www.tuni.com.ar/Tuni.png",
          description: description,
          category_id: "art",
          unit_price: Number(data.price),
          quantity: 1,
        }],
        back_urls: backUrls,
        auto_return: "approved",
        notification_url: notificationUrl,
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

exports.paymentOkTalleres = functions.https.onRequest(async (req, res) => {
  console.log("paymentOkTalleres called");
  
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
    const tallerCompraRef = admin.firestore().collection("tallerCompras").doc(paymentId);
    
    // Check if the document already exists
    const docSnapshot = await tallerCompraRef.get();
    
    if (docSnapshot.exists) {
      console.log(`Taller purchase for payment ${paymentId} already exists. Skipping duplicate notification.`);
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
    
    // Step 1: Create taller purchase document in Firestore
    // Clean selectedClases to remove unnecessary data like alumnosInscriptos
    const cleanSelectedClases = metadata.selected_clases.map(clase => ({
      index: clase.index,
      nombre: clase.nombre,
      descripcion: clase.descripcion,
      fechaHora: clase.fecha_hora,
      duracion: clase.duracion,
      profesorNombre: clase.profesor_nombre,
      profesorMail: clase.profesor_mail,
      linkMeet: clase.link_meet,
      precio: clase.precio
    }));

    const tallerCompraData = {
      idMercadoPago: paymentId,
      tallerNombre: metadata.taller_nombre,
      tallerId: metadata.taller_id,
      selectedClases: cleanSelectedClases,
      emailUsuario: metadata.usuario.mail,
      nombreUsuario: metadata.usuario.nombre,
      totalPagado: metadata.price,
      discountPercentage: metadata.discount_percentage,
      discountAmount: metadata.discount_amount,
      estadoPago: "pagado",
      createdAt: Date.now(),
    };   
    
    // Create the document with the payment ID as the document ID
    await tallerCompraRef.set(tallerCompraData);
    console.log(`Taller purchase created with ID: ${paymentId}`);
    console.log("tallerCompras document created successfully with data:", JSON.stringify(tallerCompraData, null, 2));
    
    // Step 2: Update each selected class to add user to alumnosInscriptos
    const tallerRef = admin.firestore().collection("talleres").doc(metadata.taller_id);
    const tallerDoc = await tallerRef.get();
    
    if (tallerDoc.exists) {
      const tallerData = tallerDoc.data();
      const updatedClases = [...tallerData.clases];
      
      // Add user email to alumnosInscriptos for each selected class
      metadata.selected_clases.forEach(selectedClase => {
        const claseIndex = selectedClase.index;
        if (updatedClases[claseIndex]) {
          if (!updatedClases[claseIndex].alumnosInscriptos) {
            updatedClases[claseIndex].alumnosInscriptos = [];
          }
          // Only add if not already present
          if (!updatedClases[claseIndex].alumnosInscriptos.includes(metadata.usuario.mail)) {
            updatedClases[claseIndex].alumnosInscriptos.push(metadata.usuario.mail);
          }
        }
      });
      
      // Update the taller document with updated classes
      await tallerRef.update({ clases: updatedClases });
      console.log(`Updated taller ${metadata.taller_id} with new student enrollments`);
    }
    
    // Step 3: Send confirmation email to the user
    try {
      const classesListHtml = metadata.selected_clases.map(clase => 
        `<li><strong>${clase.nombre}</strong><br>
         Descripción: ${clase.descripcion}<br>
         Fecha: ${formatFechaHora(clase.fecha_hora)}<br>
         Duración: ${clase.duracion} minutos<br>
         Profesor: ${clase.profesor_nombre}<br>
         Link de Meet: <a href="${clase.link_meet}" target="_blank">${clase.link_meet}</a><br>
         Precio: $${clase.precio}</li>`
      ).join('');

      // Get WhatsApp group link from taller data
      const whatsappGroupLink = tallerDoc.exists ? tallerDoc.data().grupoWpp : null;
      
      // Calculate original price and format pricing display
      let pricingDisplay;
      
      // Check if there was a discount applied
      if (metadata.discount_percentage && metadata.discount_percentage > 0) {
        // Calculate original price from discounted price and discount amount
        const originalPrice = parseFloat(metadata.price) + parseFloat(metadata.discount_amount || 0);
        
        pricingDisplay = `<div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
          <span style="text-decoration: line-through; color: #666; font-size: 16px;">$${originalPrice.toFixed(0)}</span>
          <strong style="color: #1A78F2; font-size: 18px;">$${metadata.price}</strong>
          <span style="background-color: #059669; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            ${metadata.discount_percentage}% OFF
          </span>
        </div>`;
      } else {
        // No discount, show regular price
        pricingDisplay = `<strong>$${metadata.price}</strong>`;
      }

      // Create email content array
      const emailContent = [
        `<ul style="text-align: left; margin: 0; padding-left: 20px;">${classesListHtml}</ul>`,
        `<strong>Total pagado: ${pricingDisplay}</strong>`
      ];

      // Add WhatsApp group link if it exists
      if (whatsappGroupLink) {
        emailContent.push(`<div style="margin-top: 20px; padding: 15px; background-color: #e8f5e8; border-radius: 8px; border-left: 4px solid #28a745;">
          <strong>📱 Grupo de WhatsApp del Taller:</strong><br>
          <a href="${whatsappGroupLink}" target="_blank" style="color: #007bff; text-decoration: none;">
            Unirse al grupo de WhatsApp
          </a><br>
          <small style="color: #666;">*Unite al grupo para recibir actualizaciones y comunicarte con otros estudiantes</small>
        </div>`);
      }
      
      const emailAlumno = {
        to: metadata.usuario.mail,
        message: {
          subject: `¡Inscripción confirmada! - Taller: ${metadata.taller_nombre}`,
          html: mailingTemplate({
            title: "¡Pago confirmado!",
            content: `Hola ${metadata.usuario.nombre || "Estudiante"}! Tu pago para el taller "${metadata.taller_nombre}" ha sido confirmado exitosamente.`,
            h3Title: "Clases adquiridas:",
            h3Content: emailContent,
            buttonText: "Ver taller",
            buttonLink: "https://www.tuni.com.ar/miperfil/"
          })
        },
      };
      
      await admin.firestore().collection("mails").add(emailAlumno);
      console.log("Confirmation email sent successfully");
    } catch (emailError) {
      console.log("Error sending confirmation email:", emailError);
      // Continue execution even if email fails
    }
    
    // Step 4: Update user document with taller enrollment information
    try {
      const userEmail = metadata.usuario.mail;
      
      // Query for user document by owner field (since email is not the document ID)
      const userQuery = await admin.firestore().collection("users")
        .where("owner", "==", userEmail)
        .limit(1)
        .get();
      
      let userRef;
      let userData = {};
      
      if (!userQuery.empty) {
        // User document exists, get the first (and should be only) result
        const userDocSnapshot = userQuery.docs[0];
        userRef = userDocSnapshot.ref;
        userData = userDocSnapshot.data();
        console.log(`Found existing user document with ID: ${userDocSnapshot.id}`);
      } else {
        // User document doesn't exist, create one with email as ID as fallback
        console.log(`No user document found for ${userEmail}, creating new one`);
        userRef = admin.firestore().collection("users").doc(userEmail);
      }
      
      // Initialize talleres object if it doesn't exist
      if (!userData.talleres) {
        userData.talleres = {};
      }
      
      // Get WhatsApp group link from taller data
      const whatsappGroupLink = tallerDoc.exists ? tallerDoc.data().grupoWpp : null;
      
      // Initialize this specific taller if it doesn't exist
      if (!userData.talleres[metadata.taller_id]) {
        userData.talleres[metadata.taller_id] = {
          tallerNombre: metadata.taller_nombre,
          clasesCompradas: [],
          grupoWpp: whatsappGroupLink
        };
      } else {
        // Update WhatsApp group link in case it changed
        userData.talleres[metadata.taller_id].grupoWpp = whatsappGroupLink;
      }
      
      // Add the newly purchased classes
      const clasesCompradas = userData.talleres[metadata.taller_id].clasesCompradas;
      metadata.selected_clases.forEach(selectedClase => {
        // Double-check the class isn't already there (shouldn't happen due to our earlier check)
        const alreadyExists = clasesCompradas.some(existingClase => existingClase.index === selectedClase.index);
        if (!alreadyExists) {
          clasesCompradas.push({
            index: selectedClase.index,
            nombre: selectedClase.nombre,
            descripcion: selectedClase.descripcion,
            fechaHora: selectedClase.fecha_hora,
            duracion: selectedClase.duracion,
            profesorNombre: selectedClase.profesor_nombre,
            profesorMail: selectedClase.profesor_mail,
            linkMeet: selectedClase.link_meet,
            precio: selectedClase.precio,
            fechaCompra: Date.now()
          });
        }
      });
      
      // Update the user document
      await userRef.set(userData, { merge: true });
      console.log(`Updated user ${userEmail} with taller enrollment information`);
      console.log("User talleres data:", JSON.stringify(userData.talleres, null, 2));
    } catch (userUpdateError) {
      console.log("Error updating user document:", userUpdateError);
      // Continue execution even if user update fails
    }
    
    console.log('Taller payment processing completed successfully');
    res.status(200).send("OK");
  } catch (error) {
    console.log("Error processing taller payment:", error);
    res.status(500).send("Error processing taller payment");
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

// Function to create 50 discount codes for the job fair
exports.createFeriaDiscountCodes = functions.https.onRequest(async (req, res) => {
  console.log("createFeriaDiscountCodes called");
  
  // Enable CORS for web requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {    
    const userEmail = 'mquijano@udesa.edu.ar';
    console.log("User creating feria discount codes:", userEmail);
    
    // Set expiration date to December 31, 2025
    const expirationDate = new Date('2025-12-31T23:59:59.999Z');
    
    const createdCodes = [];
    const failedCodes = [];
    
    // Helper function to generate random 5-character alphanumeric string
    const generateRandomCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    // Create 50 codes
    let attempts = 0;
    const maxAttempts = 200; // Safety limit to avoid infinite loops
    
    while (createdCodes.length < 50 && attempts < maxAttempts) {
      attempts++;
      
      try {
        // Generate random 5-character code
        const randomCode = generateRandomCode();
        const codigo = `FERIA-${randomCode}`;
        
        // Check if code already exists
        const existingCodeQuery = await admin.firestore()
          .collection("codigos")
          .where("codigo", "==", codigo)
          .limit(1)
          .get();
        
        if (!existingCodeQuery.empty) {
          console.log(`Code ${codigo} already exists, generating new one`);
          continue; // Try again with a new random code
        }
        
        // Create the discount code document
        const codigoDoc = {
          codigo: codigo,
          tipoDescuento: 'porcentaje',
          valorDescuento: 15,
          descripcion: 'Gracias por pasar por nuestro stand en la feria de trabajo',
          fechaCreacion: admin.firestore.FieldValue.serverTimestamp(),
          fechaExpiracion: admin.firestore.Timestamp.fromDate(expirationDate),
          limitUsos: 1,
          vecesUsado: 0,
          montoMinimo: null,
          activo: true,
          creadoPor: userEmail,
          historialUso: []
        };
        
        // Add to Firestore
        const docRef = await admin.firestore().collection("codigos").add(codigoDoc);
        
        createdCodes.push({ codigo, id: docRef.id });
        console.log(`Created discount code: ${codigo} with ID: ${docRef.id}`);
        
      } catch (error) {
        console.error(`Error creating code ${codigo}:`, error);
        failedCodes.push({ 
          codigo: codigo, 
          reason: error.message 
        });
      }
    }
    
    // Check if we couldn't create all 50 codes
    if (createdCodes.length < 50) {
      console.log(`Warning: Only created ${createdCodes.length} codes out of 50 requested after ${attempts} attempts`);
    }
    
    console.log(`Feria discount codes creation completed. Created: ${createdCodes.length}, Failed: ${failedCodes.length}`);
    
    res.status(200).json({
      success: true,
      created: createdCodes.length,
      failed: failedCodes.length,
      createdCodes: createdCodes,
      failedCodes: failedCodes,
      message: `Successfully created ${createdCodes.length} discount codes for the job fair`
    });
    
  } catch (error) {
    console.error("Error creating feria discount codes:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating feria discount codes',
      details: error.toString()
    });
  }
});