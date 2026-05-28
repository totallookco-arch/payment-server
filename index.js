const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { MercadoPagoConfig, Preference } = require('mercadopago')
 
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
 
// Webhook de MercadoPago
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body
 
    if (type === 'payment' && data?.id) {
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${data.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
          },
        }
      )
      const payment = await mpResponse.json()
      console.log('Pago recibido:', payment.status, 'Orden:', payment.external_reference)
 
      // Aqui puedes actualizar Firestore si quieres
      // usando firebase-admin
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
 