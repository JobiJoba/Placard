export function GoogleKeyGuide() {
  const linkClass = "underline underline-offset-4"
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">How to get a Google Maps API key</summary>
      <div className="mt-4 flex flex-col gap-3 text-muted-foreground">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Open the{" "}
            <a
              className={linkClass}
              href="https://console.cloud.google.com/projectselector2/home/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>{" "}
            and create or select a project.
          </li>
          <li>
            Link a billing account under{" "}
            <a
              className={linkClass}
              href="https://console.cloud.google.com/billing"
              target="_blank"
              rel="noreferrer"
            >
              Billing
            </a>
            . Google Maps Platform requires billing, and usage can incur charges.
          </li>
          <li>
            Enable{" "}
            <a
              className={linkClass}
              href="https://console.cloud.google.com/apis/library/places.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              Places API (New)
            </a>{" "}
            and{" "}
            <a
              className={linkClass}
              href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              Maps JavaScript API
            </a>{" "}
            in the selected project.
          </li>
          <li>
            Open{" "}
            <a
              className={linkClass}
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Credentials
            </a>
            , choose Create credentials → API key, then edit the key.
          </li>
          <li>
            Choose None under Application restrictions. Under API restrictions, choose Restrict key
            and select Places API (New) and Maps JavaScript API. Save, then paste the key into
            Placard.
          </li>
        </ol>
        <p>
          Placard shares one key between its server and browser map. Website restrictions block
          server Places calls, and server IP restrictions block the browser map. Signed-in browsers
          receive this key.
        </p>
        <p>
          Set{" "}
          <a
            className={linkClass}
            href="https://console.cloud.google.com/apis/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            API quotas
          </a>{" "}
          and{" "}
          <a
            className={linkClass}
            href="https://console.cloud.google.com/billing/budgets"
            target="_blank"
            rel="noreferrer"
          >
            billing budget alerts
          </a>{" "}
          to manage costs. Budget alerts notify you about spending. Quotas limit requests.
        </p>
        <p>
          Placard tests Places access before saving. Check the Add place map afterward to confirm
          Maps JavaScript API is configured.
        </p>
        <a
          className={linkClass}
          href="https://developers.google.com/maps/api-security-best-practices"
          target="_blank"
          rel="noreferrer"
        >
          Google Maps Platform security guidance
        </a>
      </div>
    </details>
  )
}
