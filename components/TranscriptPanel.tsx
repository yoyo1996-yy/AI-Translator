type TranscriptPanelProps = {
  title: string;
  language: string;
  text: string;
  placeholder: string;
  emphasized?: boolean;
};

export function TranscriptPanel({ title, language, text, placeholder, emphasized = false }: TranscriptPanelProps) {
  return (
    <section className="transcript-card" aria-label={title}>
      <div className="transcript-heading">
        <h2>{title}</h2>
        <span>{language}</span>
      </div>
      <p className={emphasized ? "transcript-text transcript-text-large" : "transcript-text"}>
        {text || placeholder}
      </p>
    </section>
  );
}
