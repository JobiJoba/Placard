import { Link } from "react-router"
import { CopySnippet } from "../components/CopySnippet"
import { SiteChrome } from "../components/SiteChrome"

const REPOSITORY = "https://github.com/JobiJoba/plugins"

const plugins = [
  {
    id: "places.menus",
    name: "Menus",
    tagline: "The menu, saved with the place.",
    description:
      "Keep lunch, dinner and drinks menus on your restaurant, café and bar cards. Organize sections and dishes, add prices, variants and item photos, and edit them manually or with an MCP assistant.",
    image: "menus.svg",
    alt: "Illustration of a restaurant menu with sections, dishes and prices",
    features: ["Menus on place details", "Prices, variants & photos", "MCP editing"],
  },
  {
    id: "places.pick",
    name: "Pick",
    tagline: "Let your library choose tonight.",
    description:
      "Choose a random place from your collection. Narrow the pool by category, list, tag, opening hours or distance, and avoid recent picks when you want somewhere different. Save your preferred settings for next time.",
    image: "pick.svg",
    alt: "Placard Pick plugin cover illustration",
    features: ["A dedicated Pick page", "Library & distance filters", "Avoid recent picks"],
  },
]

export function PluginsPage() {
  return (
    <SiteChrome>
      <main id="main" className="plugins-page">
        <header className="plugins-intro">
          <p className="eyebrow">Make room for a little more</p>
          <h1>Your library. A few extra possibilities.</h1>
          <p className="lede">
            Optional plugins for the places you keep. Add the tools you need to your own Placard
            instance, from restaurant menus to a little help choosing where to go.
          </p>
          <a href={REPOSITORY} target="_blank" rel="noreferrer">
            Browse the plugins repository on GitHub →
          </a>
        </header>

        <section className="plugins-grid" aria-label="Placard plugins">
          {plugins.map((plugin) => (
            <article className="plugin-card" key={plugin.id}>
              <img
                className="plugin-cover"
                src={`${import.meta.env.BASE_URL}plugins/${plugin.image}`}
                alt={plugin.alt}
                width={640}
                height={360}
              />
              <div className="plugin-content">
                <p className="eyebrow">{plugin.id}</p>
                <h2>{plugin.name}</h2>
                <p className="plugin-tagline">{plugin.tagline}</p>
                <p>{plugin.description}</p>
                <ul className="plugin-features">
                  {plugin.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className="plugin-install">
                  <CopySnippet
                    code={`${REPOSITORY}#${plugin.id}`}
                    label={`${plugin.name} install URL`}
                  />
                  <a
                    href={`${REPOSITORY}/tree/main/plugins/${plugin.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {plugin.name} guide & source on GitHub →
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="plugin-instructions" aria-labelledby="plugin-install-heading">
          <div>
            <p className="eyebrow">On your instance</p>
            <h2 id="plugin-install-heading">Add a plugin to Placard.</h2>
            <p>
              Already running Placard? An instance administrator can install plugins from Settings.
              New here? <Link to="/docs/install">Install Placard first.</Link>
            </p>
          </div>
          <div>
            <ol>
              <li>Copy the install URL for the plugin you want above.</li>
              <li>
                Open <strong>Settings → Module marketplace → Install from GitHub</strong> on your
                instance and paste the URL.
              </li>
              <li>Install and enable the plugin, then make it visible for your account.</li>
            </ol>
            <p>
              Keep the <code>#places.menus</code> or <code>#places.pick</code> part of the URL to
              select the correct plugin. You can also upload its package from{" "}
              <a href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer">
                GitHub Releases
              </a>
              .
            </p>
            <p>
              Plugins run with full access to your instance. Install code you trust and back up your
              database, media and module data before installing or updating.
            </p>
          </div>
        </section>
      </main>
    </SiteChrome>
  )
}
