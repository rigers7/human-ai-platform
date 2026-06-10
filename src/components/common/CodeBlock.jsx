import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { LuCheck, LuCopy } from "react-icons/lu";

export default function CodeBlock({ inline, className, children, ...props }) {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="rounded-lg overflow-hidden my-4 border border-gray-700 shadow-sm relative group">
        {/* Header Bar */}
        <div className="bg-gray-800 px-4 py-1.5 flex justify-between items-center text-xs text-gray-400 select-none border-b border-gray-700">
          <span className="font-mono font-bold uppercase text-[10px] tracking-wider">{language}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 hover:text-white transition-colors bg-gray-800/50 px-2 py-1 rounded"
          >
            {isCopied ? <><LuCheck size={12} className="text-green-400"/> Copied</> : <><LuCopy size={12}/> Copy</>}
          </button>
        </div>

        {/* Code Content */}
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.85rem', lineHeight: '1.5' }}
          showLineNumbers={true}
          lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#5c6370", textAlign: "right" }}
          {...props}
        >
          {codeContent}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={`${className} bg-gray-100 text-pink-600 rounded px-1.5 py-0.5 text-sm font-mono border border-gray-200`} {...props}>
      {children}
    </code>
  );
}
