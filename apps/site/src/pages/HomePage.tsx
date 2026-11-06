import { Link } from "react-router"
import { CopySnippet } from "../components/CopySnippet"
import { CrateStage } from "../components/CrateStage"
import { SiteChrome } from "../components/SiteChrome"

const GITHUB = "https://github.com/JobiJoba/Placard"

const QUICK_INSTALL = `bash <(curl -fsSL https://github.com/JobiJoba/Placard/releases/latest/download/install.sh)`
const WINDOWS_INSTALL = `& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://github.com/JobiJoba/Placard/releases/latest/download/install.ps1).Content))`

const features = [
  [
    "01 / Collect",
    "All those saved places. One home.",
    "Bring your Google Takeout collection, search for somewhere new, or drop a pin. Review what comes in before committing an import.",
  ],
  [
    "02 / Remember",
    "Keep the reason you saved it.",
    "A brilliant lunch. A quiet corner. A place for next time. Keep notes, dish photos, tags, and your own details beside every card.",
  ],
  [
    "03 / Rediscover",
    "Find a place for right now.",
    "Browse nearby, explore another city, or open the whole collection. Narrow it by type, list, visit status, and enriched opening hours.",
  ],
]

export function HomePage() {
  return (
    <SiteChrome>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A personal atlas, on your server</p>
            <h1 className="headline">
              Good places.
              <br />
              Worth keeping.
            </h1>
            <p className="lede">
              Turn your saved pins into a collection you actually use. Import your places, remember
              what made them special, and find your way back.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary" to="/docs/install">
                Start your library ↗
              </Link>
              <Link className="btn btn-ghost" to="/docs/product-overview">
                Explore Placard
              </Link>
            </div>
            <p className="hero-note">Self-hosted · Open source · Built for your own collection</p>
          </div>
          <div>
            <CrateStage />
            <p className="image-caption">
              Your collection, one place at a time. Placard library view.
            </p>
          </div>
        </section>
        <div className="principle-strip">
          <span>Your places.</span>
          <span>On your cards.</span>
          <span>On your server.</span>
        </div>
        <section className="editorial-section" aria-labelledby="collection-title">
          <div className="section-heading">
            <p className="eyebrow">Less saving. More remembering.</p>
            <h2 id="collection-title">A library for your kind of places.</h2>
            <p>
              From the coffee shop around the corner to the restaurant you found three cities ago.
            </p>
          </div>
          <div className="feature-columns">
            {features.map(([label, title, description]) => (
              <article key={label}>
                <p className="eyebrow">{label}</p>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <Link className="text-link" to="/docs/user-guide">
            Take a tour of your first library →
          </Link>
        </section>
        <section className="ownership-section">
          <div>
            <p className="eyebrow">Make room for your people</p>
            <h2>
              A private collection.
              <br />A shared shortlist.
            </h2>
          </div>
          <div>
            <p>
              Keep your library personal, then share selected places with an invited household.
              Everyone has their own account. You choose what leaves your private collection.
            </p>
            <p>Notes, photos, and familiar places make deciding where to go a little easier.</p>
            <Link to="/docs/user-guide">How household sharing works →</Link>
          </div>
        </section>
        <section className="editorial-section extension-section">
          <div className="section-heading">
            <p className="eyebrow">Go beyond the bookmark</p>
            <h2>Put your collection to work.</h2>
          </div>
          <div className="feature-columns two-columns">
            <article>
              <h3>A little help deciding.</h3>
              <p>
                Add an optional pick-wheel module when choosing dinner becomes the evening's main
                event. Administrators install trusted modules; each person chooses what appears in
                their navigation.
              </p>
              <Link to="/plugins">Explore plugins →</Link>
            </article>
            <article>
              <h3>Your places, in the conversation.</h3>
              <p>
                Connect an MCP-compatible assistant to your instance. Give it access with a personal
                token you can revoke, and work with the same library you browse.
              </p>
              <Link to="/docs/mcp">Connect an assistant →</Link>
            </article>
          </div>
        </section>
        <section className="editorial-section install-section" id="install">
          <div className="section-heading">
            <p className="eyebrow">A home on your own hardware</p>
            <h2>
              Bring a server.
              <br />
              Keep the collection.
            </h2>
            <p>
              Docker Compose runs Placard with its worker and database. Your photos and data live in
              persistent volumes, with documented backup and restore.
            </p>
          </div>
          <CopySnippet code={QUICK_INSTALL} label="Linux / macOS — Bash" />
          <CopySnippet code={WINDOWS_INSTALL} label="Windows — PowerShell" />
          <p>
            Install Docker first. The installer asks a few questions, generates secrets, and starts
            Placard with local-only access by default. Complete administrator setup before exposing
            your instance.
          </p>
          <Link className="btn btn-primary" to="/docs/install">
            Read the installation guide
          </Link>
        </section>
        <section className="editorial-section faq-section">
          <div className="section-heading">
            <p className="eyebrow">Before you move in</p>
            <h2>A few useful answers.</h2>
          </div>
          {[
            [
              "Do I need a Google API key?",
              "No. Manual pins, organization, Takeout triage, and MCP work without one. A key unlocks Google search, matching, and enrichment; provider usage may incur charges.",
            ],
            [
              "Can I use it on my phone?",
              "Yes, through the responsive browser app. Add it to your home screen from an HTTPS instance. Placard needs a connection to your server; offline mode is not included.",
            ],
            [
              "Can I take my data with me?",
              "Export your library as JSON, GeoJSON, and media. For complete instance recovery, back up the database, media, and module volumes together.",
            ],
            [
              "Is there a hosted subscription?",
              "Placard is self-hosted, free software under AGPL-3.0. You provide the server and manage your instance. Optional external services have their own terms and costs.",
            ],
            [
              "What does v1.0.0 mean here?",
              "We are preparing the 1.0.0 release around the implemented library experience. Deployment, real-collection, and physical-phone checks remain visible in the release-readiness guide. Install assets always refer to the latest published release.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
          <Link className="text-link" to="/docs/release-1.0">
            Follow v1.0.0 readiness →
          </Link>
        </section>
        <section className="closing-section">
          <p className="eyebrow">Keep the places. Make the memories.</p>
          <h2>
            Your next favorite place
            <br />
            might already be in your library.
          </h2>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/docs/install">
              Make yourself at home
            </Link>
            <a className="btn btn-ghost" href={GITHUB}>
              View the source
            </a>
          </div>
        </section>
      </main>
    </SiteChrome>
  )
}
