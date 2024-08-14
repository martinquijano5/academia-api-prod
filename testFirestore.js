//Comandos a ejecutar:

// - pm install -g firebase-tools / firebase init / firestore (selecciono BD) 
// / importo cuenta de servicio / npm install firebase-admin

//Este documento sirve para ejecutar cosas en la BD. 
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

//La función testFirestore nos sirve para saber si esta bien la conexión, nos crea una nueva col y la lee
async function testFirestore() {
  try {
    // Escribir un documento en la colección 'testCollection'
    const docRef = db.collection('testCollection').doc('testDocument');
    await docRef.set({
      testField: 'testValue'
    });
    console.log('Documento escrito exitosamente.');

    // Leer el documento
    const doc = await docRef.get();
    if (doc.exists) {
      console.log('Datos del documento:', doc.data());
    } else {
      console.log('No se encontró el documento.');
    }
  } catch (error) {
    console.error('Error al acceder a Firestore:', error);
  }
}

async function actualizarDisplayName(){
    try {
        const usersSnapshot = await db.collection('users').get();
        
        usersSnapshot.forEach(async (doc) => {
          const userData = doc.data();
          const email = userData.owner; // Asumimos que el documento tiene el email como ID
          const displayName = userData.name + " " + userData.surname;
    
          try {
            // Obtener el UID del usuario a partir del email
            const userRecord = await admin.auth().getUserByEmail(email);
            const uid = userRecord.uid;
    
            // Actualizar el perfil del usuario
            await admin.auth().updateUser(uid, { displayName: displayName });
    
            console.log(`Display name actualizado para el usuario con email ${email}`);
          } catch (error) {
            console.error(`Error obteniendo el UID para el email ${email}: `, error);
          }
        });
    
        console.log('Display names actualizados exitosamente.');
      } catch (error) {
        console.error('Error actualizando display names: ', error);
      }
}

actualizarDisplayName()
