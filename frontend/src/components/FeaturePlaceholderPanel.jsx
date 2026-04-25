export default function FeaturePlaceholderPanel({ highlights }) {
  return (
    <section className="placeholder-stage">
      <div className="placeholder-grid">
        {highlights.map((item) => (
          <article key={item.title} className="placeholder-card">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
