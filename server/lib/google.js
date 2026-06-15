const crypto = require('crypto');
const { google } = require('googleapis');
const { readOAuthTokens, writeOAuthTokens, readGbpSettings } = require('./storage');

const SCOPES = ['https://www.googleapis.com/auth/business.manage'];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function handleOAuthCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  writeOAuthTokens({
    ...tokens,
    connectedAt: new Date().toISOString(),
  });
  return tokens;
}

function getAuthorizedClient() {
  const tokens = readOAuthTokens();
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new Error('Google Business não conectado. Conecte na tela de administração.');
  }

  const client = getOAuthClient();
  client.setCredentials(tokens);

  client.on('tokens', (newTokens) => {
    writeOAuthTokens({ ...tokens, ...newTokens });
  });

  return client;
}

function getLocationName() {
  return process.env.GBP_LOCATION_NAME || readGbpSettings()?.locationName || null;
}

function isOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function listGoogleLocations() {
  const auth = getAuthorizedClient();
  const accountsRes = await auth.request({
    url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
  });
  const accounts = accountsRes.data?.accounts || [];
  const locations = [];

  for (const account of accounts) {
    const accountName = account.name;
    let pageToken;

    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`
      );
      url.searchParams.set('readMask', 'name,title,storefrontAddress');
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await auth.request({ url: url.toString() });
      const data = res.data || {};

      for (const location of data.locations || []) {
        const address = location.storefrontAddress;
        const addressLine = address
          ? [address.addressLines?.[0], address.locality, address.administrativeArea]
              .filter(Boolean)
              .join(', ')
          : '';

        locations.push({
          name: location.name,
          title: location.title || 'Sem nome',
          address: addressLine,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  return locations;
}

async function fetchAllGoogleReviews() {
  const locationName = getLocationName();
  if (!locationName) {
    throw new Error(
      'Perfil Google não selecionado. Conecte o Google e escolha o estabelecimento no admin.'
    );
  }

  const auth = getAuthorizedClient();
  const parent = locationName.replace(/^\//, '');

  let pageToken;
  const allReviews = [];
  let averageRating;
  let totalReviewCount;

  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`);
    url.searchParams.set('pageSize', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await auth.request({ url: url.toString() });
    const data = res.data || {};

    if (data.reviews?.length) {
      allReviews.push(...data.reviews);
    }
    if (data.averageRating != null) averageRating = data.averageRating;
    if (data.totalReviewCount != null) totalReviewCount = data.totalReviewCount;

    pageToken = data.nextPageToken;
  } while (pageToken);

  return {
    reviews: allReviews,
    averageRating,
    totalReviewCount,
  };
}

function isGoogleConfigured() {
  return isOAuthConfigured() && Boolean(getLocationName());
}

function isGoogleConnected() {
  const tokens = readOAuthTokens();
  return Boolean(tokens?.refresh_token || tokens?.access_token);
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  fetchAllGoogleReviews,
  listGoogleLocations,
  getLocationName,
  isOAuthConfigured,
  isGoogleConfigured,
  isGoogleConnected,
  getAuthorizedClient,
};
