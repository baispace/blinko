module.exports = {
  types: {
    feat: { title: "✨ Features" },
    fix: { title: "🐛 Bug Fixes" },
    docs: { title: "📝 Documentation" },
    style: { title: "💄 Styles" },
    refactor: { title: "♻️ Code Refactoring" },
    perf: { title: "⚡️ Performance Improvements" },
    test: { title: "✅ Tests" },
    build: { title: "🏗️ Build System" },
    ci: { title: "👷 CI/CD Changes" },
    chore: { title: "🔧 Chores" },
    revert: { title: "⏪ Reverts" }
  },
  excludeTypes: ["chore", "refactor", "test", "style"],
  parseCommit: function(commit) {
    const standardRegex = /^(\w+)(?:\(([^\)]+)\))?:(.+)$/;
    const emojiRegex = /^(?:([^\s:]+)\s)?(\w+)(?:\(([^\)]+)\))?:(.+)$/;
    
    let match = standardRegex.exec(commit.subject);
    
    if (match) {
      return {
        type: match[1],
        scope: match[2] || '',
        subject: match[3].trim()
      };
    }
    
    match = emojiRegex.exec(commit.subject);
    
    if (match) {
      const emoji = match[1];
      const type = match[2];
      const scope = match[3] || '';
      const subject = match[4].trim();
      return {
        type: type,
        scope: scope,
        subject: emoji ? `${emoji} ${subject}` : subject
      };
    }
    
    return {
      type: '',
      scope: '',
      subject: commit.subject
    };
  },
  renderTypeSection: function (typeSection, commits, typeTitle) {
    if (commits.length === 0) return "";
    
    let output = `### ${typeTitle}\n\n`;
    
    commits.forEach(commit => {
      const shortHash = commit.hash.substring(0, 7);
      
      let message = commit.subject;
      
      if (commit.scope) {
        message = `**${commit.scope}**: ${message}`;
      }
      
      output += `- ${message} (${shortHash})\n`;
    });
    
    return output + "\n";
  },
  renderFooter: function() {
    return "---\n\n**Full Changelog**: https://github.com/anothercat/blinko/compare/{{from}}...{{to}}\n";
  }
}; 