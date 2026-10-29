import { Link } from "react-router"
import { SiteChrome } from "../components/SiteChrome"

const DOCS = "https://github.com/JobiJoba/Placard/blob/main/docs/install.md"
const RELEASES = "https://github.com/JobiJoba/Placard/releases/latest"
const COMPOSE_LATEST =
  "https://github.com/JobiJoba/Placard/releases/latest/download/docker-compose.yml"
const ENV_LATEST = "https://github.com/JobiJoba/Placard/releases/latest/download/example.env"
const COMPOSE_MAIN = "https://raw.githubusercontent.com/JobiJoba/Placard/main/compose.ghcr.yaml"
const ENV_MAIN = "https://raw.githubusercontent.com/JobiJoba/Placard/main/.env.example"

export function InstallPage() {
  return (
    <SiteChrome>
      <main className="install">
        <p className="brand install-brand">Placard</p>
        <h1>Install with Docker Compose</h1>
        <p className="lede">Three steps. No local build — pull a published image from GHCR.</p>

        <ol className="steps">
          <li>
            <h2>Download the required files</h2>
            <pre className="install-snippet">
              <code>{`mkdir ./placard-app
cd ./placard-app
curl -fsSL -o docker-compose.yml \\
  ${COMPOSE_LATEST}
curl -fsSL -o example.env \\
  ${ENV_LATEST}`}</code>
            </pre>
            <p>
              Or grab both from the{" "}
              <a href={RELEASES} rel="noreferrer" target="_blank">
                latest release
              </a>
              .
            </p>
            <details className="fallback">
              <summary>No release yet?</summary>
              <p>
                Until the first <code>v*</code> tag, use tip-of-main (defaults to{" "}
                <code>:nightly</code>):
              </p>
              <pre className="install-snippet">
                <code>{`curl -fsSL -o docker-compose.yml \\
  ${COMPOSE_MAIN}
curl -fsSL -o example.env \\
  ${ENV_MAIN}`}</code>
              </pre>
            </details>
          </li>
          <li>
            <h2>Populate the .env file</h2>
            <pre className="install-snippet">
              <code>{"cp example.env .env"}</code>
            </pre>
            <p>
              Set <code>POSTGRES_PASSWORD</code>, <code>BETTER_AUTH_SECRET</code> (
              <code>openssl rand -base64 32</code>), and <code>PUBLIC_URL</code>.
            </p>
          </li>
          <li>
            <h2>Start the containers</h2>
            <pre className="install-snippet">
              <code>{"docker compose up -d"}</code>
            </pre>
            <p>
              Open your <code>PUBLIC_URL</code>. Health: <code>/api/health</code>. The first signup
              becomes admin.
            </p>
          </li>
        </ol>

        <p className="band-more">
          Coolify, Google APIs, backup, upgrade, and build-from-source:{" "}
          <a href={DOCS} rel="noreferrer" target="_blank">
            docs/install.md
          </a>
          . <Link to="/">← Home</Link>
        </p>
      </main>
    </SiteChrome>
  )
}
