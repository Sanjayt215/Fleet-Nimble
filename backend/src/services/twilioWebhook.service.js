import twilio from 'twilio';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

let twilioClient = null;

function getClient() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

export function validateTwilioRequest(req) {
  if (config.env === 'development') return true;
  if (!config.twilio.authToken) return false;

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) return false;

  const url = config.publicUrl + req.originalUrl;
  try {
    return twilio.validateRequest(config.twilio.authToken, twilioSignature, url, req.body);
  } catch (err) {
    logger.error('TWILIO_SIGNATURE_VALIDATION_ERROR', { error: err.message });
    return false;
  }
}

export function buildIncomingTwiML(callSid, from, cfg = {}) {
  const twiml = new VoiceResponse();
  const baseUrl = cfg.publicUrl || config.publicUrl;

  let host;
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = 'localhost:5000';
  }

  const connect = twiml.connect();
  connect.stream({
    url: `wss://${host}/api/ai-receptionist/twilio/media-stream`,
    track: 'both_tracks',
  });

  logger.info('TWILIO_TWIML_GENERATED', { callSid, from });
  return twiml.toString();
}

export function buildFallbackTwiML() {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'polly.Joanna' },
    'Thank you for calling. We are experiencing technical difficulties. Please try again later.'
  );
  twiml.hangup();
  return twiml.toString();
}

export function buildForwardCallTwiML(toNumber, callerId) {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'polly.Joanna' },
    'Please hold while we connect you to a team member.'
  );
  const dial = twiml.dial({ callerId });
  dial.number(toNumber);
  return twiml.toString();
}

export async function makeCall(to, from, statusCallbackUrl) {
  const client = getClient();
  if (!client) {
    logger.warn('TWILIO_CLIENT_NOT_CONFIGURED');
    return null;
  }

  try {
    const call = await client.calls.create({
      to,
      from,
      url: `${config.publicUrl}/api/ai-receptionist/twilio/voice`,
      statusCallback: statusCallbackUrl || `${config.publicUrl}/api/ai-receptionist/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });
    logger.info('TWILIO_CALL_CREATED', { callSid: call.sid });
    return call;
  } catch (err) {
    logger.error('TWILIO_CALL_CREATE_ERROR', { error: err.message });
    return null;
  }
}

export default { validateTwilioRequest, buildIncomingTwiML, buildFallbackTwiML, buildForwardCallTwiML, makeCall };