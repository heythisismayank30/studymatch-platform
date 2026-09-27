const express = require('express');
const path = require('path');
const twilio = require('twilio');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const VoiceResponse = twilio.twiml.VoiceResponse;

// Public URL used by Twilio webhooks. On Heroku, set PUBLIC_BASE_URL to your
// app URL. Locally, SERVER_URL can continue to point to localhost.
function getPublicBaseUrl(req) {
    const configured = process.env.PUBLIC_BASE_URL || process.env.SERVER_URL;
    if (configured) return configured.replace(/\/$/, '');

    // Heroku exposes the app name as HEROKU_APP_NAME.
    if (process.env.HEROKU_APP_NAME) {
        return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    }

    // Useful when the app is behind a reverse proxy.
    const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
    const host = req?.headers?.['x-forwarded-host'] || req?.get?.('host');
    if (host) return `${proto.split(',')[0].trim()}://${host}`;

    return `http://localhost:${process.env.PORT || 3000}`;
}

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve static files
app.use(express.static('public'));
app.use(express.static('.'));

// Twilio Client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// In-memory storage
let callState = {};

// ========================================
// DASHBOARD & STATIC FILES
// ========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ivr_dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'ivr_dashboard.html'));
});

// ========================================
// ROUTES FOR CALLING
// ========================================

/**
 * Initiate a call to a lead
 * POST /api/calls/make
 */
app.post('/api/calls/make', async (req, res) => {
    const { to, name, course, deadline } = req.body;

    try {
        const call = await twilioClient.calls.create({
            url: `${getPublicBaseUrl(req)}/webhooks/voice`,
            to: to,
            from: process.env.TWILIO_PHONE_NUMBER,
            statusCallback: `${getPublicBaseUrl(req)}/webhooks/call-status`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });

        // Store call context
        callState[call.sid] = {
            leadName: name,
            course: course,
            deadline: deadline,
            phone: to,
            startTime: new Date(),
            transcript: []
        };

        res.json({
            success: true,
            callSid: call.sid,
            message: `Calling ${name}...`
        });
    } catch (error) {
        console.error('Call error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Webhook: Handle incoming call (voice)
 * GET/POST /webhooks/voice
 */
app.post('/webhooks/voice', (req, res) => {
    const response = new VoiceResponse();
    const callSid = req.body.CallSid;

    if (!callState[callSid]) {
        callState[callSid] = { transcript: [] };
    }

    const context = callState[callSid];

    // Initial greeting
    const greeting = `Hi ${context.leadName}, this is an automated call about your ${context.course} course. 
    Your enrollment deadline is ${context.deadline}. 
    Press 1 if you're interested, or press 2 if you're not interested.`;

    response.gather({
        numDigits: 1,
        actionOnEmptyResult: true,
        action: `${getPublicBaseUrl(req)}/webhooks/dtmf`,
        method: 'POST'
    }).say({
        voice: 'alice'
    }, greeting);

    // Fallback
    response.say({ voice: 'alice' }, 'Sorry, I didn\'t catch that. Thank you for your time. Goodbye.');
    response.hangup();

    // Log to transcript
    context.transcript.push({
        speaker: 'system',
        message: greeting,
        timestamp: new Date()
    });

    res.type('text/xml');
    res.send(response.toString());
});

/**
 * Webhook: Handle DTMF input (keypresses)
 * POST /webhooks/dtmf
 */
app.post('/webhooks/dtmf', (req, res) => {
    const response = new VoiceResponse();
    const callSid = req.body.CallSid;
    const digits = req.body.Digits;

    const context = callState[callSid] || {};

    let followUp = '';

    if (digits === '1') {
        // Interested
        followUp = `Excellent! I'm glad you're interested in ${context.course}. 
        I'll send you the enrollment details and course information. 
        Your deadline is ${context.deadline}. Thank you!`;

        context.interest = 'interested';
        context.sentiment = 'positive';
    } else if (digits === '2') {
        // Not interested
        followUp = `I understand. No problem at all. 
        If you change your mind about ${context.course}, feel free to reach out. 
        Our deadline is ${context.deadline}. Have a great day!`;

        context.interest = 'not_interested';
        context.sentiment = 'negative';
    } else {
        followUp = `I didn't catch that. Thank you for your time. Goodbye.`;
    }

    response.say({ voice: 'alice' }, followUp);
    response.hangup();

    // Log to transcript
    context.transcript.push({
        speaker: 'learner',
        message: `Pressed ${digits}`,
        timestamp: new Date()
    });

    context.transcript.push({
        speaker: 'system',
        message: followUp,
        timestamp: new Date()
    });

    res.type('text/xml');
    res.send(response.toString());
});

/**
 * Webhook: Track call status
 * POST /webhooks/call-status
 */
app.post('/webhooks/call-status', (req, res) => {
    const callSid = req.body.CallSid;
    const status = req.body.CallStatus;

    if (callState[callSid]) {
        callState[callSid].status = status;
        if (status === 'completed') {
            callState[callSid].endTime = new Date();
            callState[callSid].duration = Math.round(
                (callState[callSid].endTime - callState[callSid].startTime) / 1000
            );
        }
    }

    res.status(200).send('');
});

// ========================================
// API ROUTES FOR DASHBOARD
// ========================================

/**
 * Get call results
 * GET /api/calls/results
 */
app.get('/api/calls/results', (req, res) => {
    const results = Object.entries(callState).map(([sid, context]) => ({
        callSid: sid,
        name: context.leadName,
        phone: context.phone,
        course: context.course,
        interest: context.interest || 'pending',
        sentiment: context.sentiment || 'neutral',
        duration: context.duration || 0,
        transcript: context.transcript,
        startTime: context.startTime,
        endTime: context.endTime
    }));

    res.json({
        success: true,
        results: results,
        total: results.length
    });
});

/**
 * Get specific call details
 * GET /api/calls/:sid
 */
app.get('/api/calls/:sid', (req, res) => {
    const context = callState[req.params.sid];
    
    if (!context) {
        return res.status(404).json({ error: 'Call not found' });
    }

    res.json({
        success: true,
        call: {
            callSid: req.params.sid,
            ...context
        }
    });
});

/**
 * Clear call history
 * POST /api/calls/clear
 */
app.post('/api/calls/clear', (req, res) => {
    callState = {};
    res.json({ success: true, message: 'Call history cleared' });
});

// ========================================
// HEALTH CHECK
// ========================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'IVR System',
        version: '1.0.0',
        twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID
    });
});

// ========================================
// ERROR HANDLING
// ========================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
    ========================================
    🎯 IVR System Running
    ========================================
    
    Public URL: ${process.env.PUBLIC_BASE_URL || process.env.SERVER_URL || (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : `http://localhost:${PORT}`)}
    Twilio Phone: ${process.env.TWILIO_PHONE_NUMBER || 'Not configured'}
    
    Endpoints:
    - POST /api/calls/make           (Initiate call)
    - GET  /api/calls/results        (Get results)
    - GET  /api/calls/:sid           (Get call details)
    - POST /api/calls/clear          (Clear history)
    - GET  /health                   (Health check)
    
    ========================================
    `);
});
