// Rota de contato: recebe dados do form e envia por email + cria link WhatsApp
const express = require('express');
const path = require('path');

const router = express.Router();

// POST /api/contact
// Body: { name, phone, email, area, message }
router.post('/contact', async (req, res) => {
  const { name = '', phone = '', email = '', area = '', message = '' } = req.body || {};

  if (!name || !message) {
    return res.status(400).json({ error: 'Nome e mensagem são obrigatórios.' });
  }

  // Por enquanto: registra em data/contacts.json (persistencia simples)
  // Em producao: enviar por email via SMTP + abrir WhatsApp Web no front
  try {
    const fs = require('fs');
    const dataDir = path.join(__dirname, '..', 'data');
    const contactsFile = path.join(dataDir, 'contacts.json');

    let contacts = [];
    if (fs.existsSync(contactsFile)) {
      try {
        contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8') || '[]');
      } catch (e) {
        contacts = [];
      }
    }

    const entry = {
      id: Date.now().toString(36),
      name: String(name).slice(0, 120),
      phone: String(phone).slice(0, 30),
      email: String(email).slice(0, 200),
      area: String(area).slice(0, 50),
      message: String(message).slice(0, 2000),
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
      createdAt: new Date().toISOString(),
    };

    contacts.push(entry);
    fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2), 'utf8');

    return res.json({
      ok: true,
      id: entry.id,
      whatsappLink: buildWhatsAppLink(phone, area, message),
    });
  } catch (err) {
    console.error('contact route error:', err);
    return res.status(500).json({ error: 'Falha ao registrar contato.' });
  }
});

function buildWhatsAppLink(phone, area, message) {
  // Numero da Dra. Nilma (a definir no Coolify depois)
  const NILMA_PHONE = process.env.WHATSAPP_NUMBER || '5511987654321';
  const text = encodeURIComponent(
    `Olá, Dra. Nilma! Vim pelo site.\n` +
    `Área: ${area || 'Não informada'}\n` +
    `Mensagem: ${message || ''}`
  );
  return `https://wa.me/${NILMA_PHONE}?text=${text}`;
}

module.exports = router;
