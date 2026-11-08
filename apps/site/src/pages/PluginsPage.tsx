import { Link } from "react-router"
import { PluginPreview } from "../components/PluginPreview"
import { SiteChrome } from "../components/SiteChrome"

const REPOSITORY = "https://github.com/JobiJoba/plugins"

const plugins = [
  {
    id: "places.day-out",
    name: "Day Out",
    tagline: "One favourite place. A whole day of possibilities.",
    description:
      "Build a day around a saved place. Find a café before the museum or dinner nearby, arrange your stops and keep the outing ready for next time.",
    image: "day-out.svg",
    screenshot: "day-out-desktop.png",
    alt: "Day Out route connecting a coffee stop, a favourite place and dinner nearby",
    features: [
      "Nearby stops from your library",
      "Editable, private itineraries",
      "Navigation links & MCP planning",
    ],
  },
  {
    id: "places.board",
    name: "Board",
    tagline: "Your favorite places. A board of your own.",
    description:
      "Turn 22 saved places into a travel board. Arrange your stops, customize the labels, explore a 3D preview and export a print-ready PDF for a print shop or your home printer.",
    screenshot: "board-desktop.png",
    image: "board.svg",
    alt: "Illustration of a travel board with colored place tiles around its edge",
    features: ["22 places from your library", "Flat & 3D previews", "Print-ready PDF exports"],
  },
  {
    id: "places.menus",
    name: "Menus",
    tagline: "The menu, saved with the place.",
    description:
      "Keep lunch, dinner and drinks menus on your restaurant, café and bar cards. Organize sections and dishes, add prices, variants and item photos, and edit them manually or with an MCP assistant.",
    screenshot: "menus-desktop.png",
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
    screenshot: "pick-desktop.png",
    image: "pick.svg",
    alt: "Placard Pick plugin cover illustration",
    features: ["A dedicated Pick page", "Library & distance filters", "Avoid recent picks"],
  },
  {
    id: "places.decide-together",
    name: "Decide Together",
    tagline: "Vote on where to go.",
    description: "Vote on a shortlist and reveal your household’s favorite places.",
    image: "decide-together.svg",
    screenshot: "decide-together.svg",
    alt: "Decide Together voting illustration",
    features: ["Shared shortlists", "Household voting", "Reveal your favorites"],
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
            instance, from restaurant menus and choosing where to go to printing a board of your
            favorite places, or planning a day around them.
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
                <PluginPreview name={plugin.name} image={plugin.screenshot} />
                <div className="plugin-install">
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
              <li>Open Marketplace in Placard’s main navigation.</li>
              <li>Choose a plugin and ask an instance admin to activate it.</li>
              <li>Open its page or find the feature on your place cards.</li>
            </ol>
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
