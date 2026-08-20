const COGNITO_ISSUER =
  "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_hIzdOIz3F";

const CLIENT_ID = "1sipdb5kv8spd6dqbvkmgf5nbi";

let jwks;
let jwtVerify;

async function loadJose() {
  if (!jwks || !jwtVerify) {
    const jose = await import("jose");

    jwks = jose.createRemoteJWKSet(
      new URL(`${COGNITO_ISSUER}/.well-known/jwks.json`)
    );

    jwtVerify = jose.jwtVerify;
  }
}

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        message: "Authorization token required"
      });
    }

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid authorization header"
      });
    }

    const token = authorization.substring(7);

    await loadJose();

    const { payload } = await jwtVerify(token, jwks, {
      issuer: COGNITO_ISSUER,
      algorithms: ["RS256"]
    });

    if (payload.token_use !== "access") {
      return res.status(401).json({
        message: "Invalid token type"
      });
    }

    if (payload.client_id !== CLIENT_ID) {
      return res.status(401).json({
        message: "Token was not issued for this application"
      });
    }

    if (!payload.sub) {
      return res.status(401).json({
        message: "User identity not found"
      });
    }

    req.user = {
      sub: payload.sub,
      username: payload.username,
      clientId: payload.client_id
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      message: "Invalid or expired authentication token"
    });
  }
}

module.exports = authenticate;