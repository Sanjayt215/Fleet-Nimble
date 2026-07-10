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
  // Bypass signature validation outside of production (development / test).
  if (config.env !== 'production') {
    if (config.env === 'development') {
      logger.warn('TWILIO_SIGNATURE_VALIDATION_BYPASS', {
        reason: 'NODE_ENV is not production',
      });
    }
    return true;
  }

  // Explicit disable (e.g. proxy misconfiguration workaround).
  if (config.twilio.validateSignature === false) {
    logger.warn('TWILIO_SIGNATURE_VALIDATION_BYPASS', {
      reason: 'TWILIO_VALIDATE_SIGNATURE disabled',
    });
    return true;
  }

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

export function buildMediaStreamUrl(baseUrl = config.publicUrl) {
  try {
    const u = new URL(baseUrl);
    const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    const streamUrl = `${wsProtocol}//${u.host}/api/ai-receptionist/twilio/media-stream`;
    logger.info('DIAG_MEDIA_STREAM_URL_BUILT', {
      baseUrl,
      wsProtocol,
      host: u.host,
      streamUrl,
    });
    return streamUrl;
  } catch (err) {
    const fallback = 'wss://localhost:5000/api/ai-receptionist/twilio/media-stream';
    logger.warn('DIAG_MEDIA_STREAM_URL_FALLBACK', {
      baseUrl,
      error: err.message,
      fallback,
    });
    return fallback;
  }
}

export function buildIncomingTwiML(callSid, from, to, cfg = {}) {
  const twiml = new VoiceResponse();
  const streamUrl = buildMediaStreamUrl(cfg.publicUrl || config.publicUrl);

  const connect = twiml.connect();
  const stream = connect.stream({ url: streamUrl, track: 'both_tracks' });

  // Pass call context as Twilio <Parameter> children (available in the `start` event).
  if (callSid) stream.parameter({ name: 'callSid', value: callSid });
  if (from) stream.parameter({ name: 'from', value: from });
  if (to) stream.parameter({ name: 'to', value: to });

  logger.info('TWILIO_TWIML_GENERATED', { callSid, from });
  return twiml.toString();
}

export function buildGreetingTwiML() {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'alice', language: 'en-US' },
    'Hello. Thank you for calling FleetNimble. You have reached the FleetNimble AI Receptionist. ' +
      'Your call has successfully reached our production server. ' +
      'This confirms the phone system is configured correctly. ' +
      'Our intelligent voice assistant will be connected in the next deployment. ' +
      'Thank you for calling FleetNimble. Goodbye.'
  );
  twiml.hangup();
  return twiml.toString();
}

export function buildUnavailableTwiML() {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'alice', language: 'en-US' },
    'Thank you for calling FleetNimble. Our AI Receptionist is currently unavailable. Please try again later.'
  );
  twiml.hangup();
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

export default { validateTwilioRequest, buildMediaStreamUrl, buildIncomingTwiML, buildGreetingTwiML, buildUnavailableTwiML, buildFallbackTwiML, buildForwardCallTwiML, makeCall };