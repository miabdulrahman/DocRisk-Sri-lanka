import fs from "fs";

const p = "client/src/App.tsx";
let s = fs.readFileSync(p, "utf8");

const broken = /return \(\s*\n\s*<div className="analyze-tab">[\s\S]*?<\/motion\?[\s\S]*?\n\n\/\/ Skeleton Loader/;

const replacement = `return (
    <div className="analyze-tab">
      <LanguageSelector value={outputLang} onChange={setOutputLang} />
      {analyzing && <SkeletonLoader />}
      <div className={analyzing ? 'analyze-tab__upload analyze-tab__upload--hidden' : 'analyze-tab__upload'}>
        <Dashboard
          user={user}
          outputLang={outputLang}
          onAnalyzingChange={setAnalyzing}
          onResult={setAnalysis}
        />
      </div>
    </div>
  )
}

// Skeleton Loader`;

if (!broken.test(s)) {
  console.error("pattern not found");
  process.exit(1);
}

s = s.replace(broken, replacement);
fs.writeFileSync(p, s);
console.log("fixed");
