import { Clock3, Sparkles } from 'lucide-react'

export default function FeaturePlaceholderPanel({
  kicker,
  title,
  description,
  highlights,
}) {
  return (
    <section className="placeholder-stage panel">
      <div className="placeholder-hero">
        <div className="placeholder-hero-icon">
          <Sparkles size={20} />
        </div>
        <div className="placeholder-hero-copy">
          <span className="panel-kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="pill subtle">
          <Clock3 size={14} />
          占位中
        </span>
      </div>

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
