import { Link } from "react-router"
import { CrateStage } from "../components/CrateStage"
import { SiteChrome } from "../components/SiteChrome"

const GITHUB = "https://github.com/JobiJoba/Placard"

export function HomePage() {
  return (
    <SiteChrome>
      <section className="hero">
        <div className="hero-copy">
          <p className="brand">Placard</p>
          <h1 className="headline">Your places. On your cards. On your server.</h1>
          <p className="lede">
            A self-hosted library for the places you care about — browse, decide, and talk to it
            with MCP.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/install">
              Install
            </Link>
            <a className="btn btn-ghost" href={GITHUB} rel="noreferrer" target="_blank">
              GitHub
            </a>
          </div>
        </div>
        <CrateStage />
      </section>

      <section className="band">
        <h2>Library you own</h2>
        <p>
          Import Google Takeout, drop pins, keep notes and photos with each place. Search your list
          — not someone else’s cloud.
        </p>
      </section>

      <section className="band band-alt">
        <h2>Decide together</h2>
        <p>
          Modules like Decide spin a shortlist from your library when “where should we eat?” stalls.
          More modules plug in without forking the core.
        </p>
      </section>

      <section className="band">
        <h2>MCP for agents</h2>
        <p>
          Cursor, Claude, and friends reach your places over the same instance — with tokens you
          control.
        </p>
      </section>

      <section className="band band-alt">
        <h2>Self-host like Immich</h2>
        <p>
          Docker Compose, one image from GHCR, data in named volumes. Coolify-friendly. AGPL-3.0.
        </p>
        <pre className="install-snippet">
          <code>{`mkdir ./placard-app && cd ./placard-app
curl -fsSL -o docker-compose.yml \\
  https://github.com/JobiJoba/Placard/releases/latest/download/docker-compose.yml
curl -fsSL -o example.env \\
  https://github.com/JobiJoba/Placard/releases/latest/download/example.env
cp example.env .env   # edit secrets + PUBLIC_URL
docker compose up -d`}</code>
        </pre>
        <p className="band-more">
          <Link to="/install">Full install steps →</Link>
        </p>
      </section>
    </SiteChrome>
  )
}
