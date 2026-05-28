
const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { MercadoPagoConfig, Preference } = require('mercadopago')
const admin = require('firebase-admin')
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
 
// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
 
const db = admin.firestore()
 
const app = express()
app.use(cors())
app.use(express.json())
 
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
})
 
// Crear preferencia de pago
app.post('/create-preference', async (req, res) => {
  try {
    const { items, shipping, orderId } = req.body
 
    const preference = new Preference(client)
 
    const response = await preference.create({
      body: {
        items: items.map(item => ({
          id: item.productId,
          title: item.productName,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          currency_id: 'COP',
        })),
        payer: {
          name: shipping.name,
          email: shipping.email,
          phone: { number: shipping.phone },
          address: {
            zip_code: shipping.zipCode || '',
            street_name: shipping.address,
          },
        },
        back_urls: {
          success: `https://totallook-b2d33.web.app/pedido/exitoso?orderId=${orderId}`,
          failure: `https://totallook-b2d33.web.app/pedido/fallo?orderId=${orderId}`,
          pending: `https://totallook-b2d33.web.app/pedido/pendiente?orderId=${orderId}`,
        },
        auto_return: 'approved',
        external_reference: orderId,
        notification_url: 'https://payment-server-n1wt.onrender.com/webhook',
      },
    })
 
    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    })
  } catch (error) {
    console.error('Error creando preferencia:', error)
    res.status(500).json({ error: 'Error al crear preferencia de pago' })
  }
})
 
// Webhook de MercadoPago — actualiza estado del pedido automáticamente
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body
 
    console.log('Webhook recibido:', type, data)
 
    if (type === 'payment' && data?.id) {
      // Obtener info del pago desde MercadoPago
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${data.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
          },
        }
      )
 
      const payment = await mpResponse.json()
      console.log('Pago:', payment.status, '| Orden:', payment.external_reference)
 
      const orderId = payment.external_reference
 
      if (orderId) {
        // Mapear estado de MercadoPago a estado de la tienda
        let newStatus = 'pending'
        if (payment.status === 'approved') newStatus = 'paid'
        else if (payment.status === 'rejected') newStatus = 'cancelled'
        else if (payment.status === 'in_process') newStatus = 'pending'
 
        // Actualizar pedido en Firestore
        await db.collection('orders').doc(orderId).update({
          status: newStatus,
          paymentId: String(data.id),
          paymentStatus: payment.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
 
        console.log(`Pedido ${orderId} actualizado a: ${newStatus}`)
      }
    }
 
    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Webhook error' })
  }
})
 
// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Payment server running' })
})
 
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
})
 