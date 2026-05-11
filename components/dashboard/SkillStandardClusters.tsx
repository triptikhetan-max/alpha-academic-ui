/**
 * SkillStandardClusters — group students by shared CCSS standard / weak topic.
 * Each cluster card shows: standard / topic name, N students · M campuses,
 * top 5 student names.
 */
export interface SkillCluster {
  label: string;
  kind: "standard" | "topic";
  subject?: string;
  studentNames: string[];
  campuses: string[];
}

interface SkillStandardClustersProps {
  clusters: SkillCluster[];
}

export function SkillStandardClusters({ clusters }: SkillStandardClustersProps) {
  if (clusters.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-6 text-center">
        <p className="text-sm font-medium text-ink mb-1">No skill clusters yet</p>
        <p className="text-xs text-stone-500">
          Standards and weak topics will appear here once enough students share
          the same gap.
        </p>
      </section>
    );
  }
  return (
    <section
      className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Skill / standard clusters"
    >
      {clusters.map((cluster) => {
        const top = cluster.studentNames.slice(0, 5);
        const more = cluster.studentNames.length - top.length;
        return (
          <article
            key={`${cluster.kind}:${cluster.label}`}
            className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
          >
            <header className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-ink truncate">
                {cluster.label}
              </h3>
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                  cluster.kind === "standard"
                    ? "bg-blue-50 text-blue-800 border-blue-200"
                    : "bg-amber-50 text-amber-900 border-amber-200"
                }`}
              >
                {cluster.kind === "standard" ? "Standard" : "Topic"}
              </span>
            </header>
            <p className="text-xs text-stone-500">
              {cluster.studentNames.length} student
              {cluster.studentNames.length === 1 ? "" : "s"}
              {cluster.campuses.length > 0
                ? ` · ${cluster.campuses.length} campus${
                    cluster.campuses.length === 1 ? "" : "es"
                  }`
                : ""}
              {cluster.subject ? ` · ${cluster.subject}` : ""}
            </p>
            <ul className="text-xs text-stone-700 space-y-0.5">
              {top.map((name) => (
                <li key={`${cluster.label}-${name}`}>{name}</li>
              ))}
              {more > 0 ? (
                <li className="text-stone-500">+ {more} more</li>
              ) : null}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
