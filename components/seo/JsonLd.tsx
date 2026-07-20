/**
 * Renders one or more JSON-LD objects as a <script type="application/ld+json">.
 * Server component. `<` is escaped so restaurant/guide content can never break
 * out of the script tag.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
