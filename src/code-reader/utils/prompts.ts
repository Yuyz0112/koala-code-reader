import {
  SharedStorage,
  generateFileStructureWithStatus,
  getAnalyzedUnderstandings,
} from "./storage";

export const getEntryFilePrompt = ({
  basic,
}: Pick<
  SharedStorage,
  "basic"
>) => `You are a code analysis assistant helping to identify the best entry point for understanding a codebase.

<AnalysisContext>
Repository: ${basic.repoName}
Main Goal: ${basic.mainGoal}
${
  basic.specificAreas
    ? `Specific Areas of Interest: ${basic.specificAreas}`
    : ""
}

File Structure:
${generateFileStructureWithStatus(basic.files)}
</AnalysisContext>

<Task>
Based on the provided context, determine the most logical entry file to start the code analysis. Consider:

1. **Main Goal Alignment**: Which file would best serve the stated analysis goal?
2. **Entry Points**: Look for typical entry points like:
   - Main application files (index.js, main.ts, app.ts, etc.)
   - Configuration files that reveal architecture
   - Key domain/business logic files
   - Files mentioned in package.json scripts
3. **Specific Areas**: If specific areas are mentioned, prioritize files related to those areas
4. **Project Structure**: Consider the project type and common patterns

If the current information is insufficient to make a confident decision, ask for clarification.
</Task>

<OutputFormat>
**Every response MUST consist solely of valid YAML that conforms exactly to the schema below—no extra text, explanations, or comments.**

**If you can identify an entry file:**
\`\`\`yaml
decision: entry_file_found
next_file:
  name: "path/to/file.ext"     # string - exact file path
  reason: "Brief explanation"   # string - why this file is the best starting point
\`\`\`

**If you need more information:**
\`\`\`yaml
decision: need_more_info
ask_user: "Specific question about what additional information you need"  # string
\`\`\`
</OutputFormat>

Analyze the codebase structure and provide your decision:`;

export const analyzeFilePrompt = (
  {
    basic,
    nextFile,
    currentFile,
    userFeedback,
  }: Pick<SharedStorage, "basic" | "nextFile" | "currentFile" | "userFeedback">,
  toAnalyzeContent: string,
  relevantContexts: string[] = [] // Add context parameter with default empty array
) => {
  const allUnderstandings = getAnalyzedUnderstandings(basic.files);
  // Determine the analysis scenario based on userFeedback
  let analysisScenario = "";
  let instructions = "";

  if (!userFeedback) {
    // First analysis or continuing without feedback
    analysisScenario = nextFile
      ? `**ANALYZE NEW FILE**: ${nextFile.name}
Reason for analyzing this file: ${nextFile.reason}`
      : "**CONTINUE ANALYSIS** based on current context";

    instructions = `1. **Analyze the file content** thoroughly to understand its purpose, key functionality, and role
2. **Provide your analysis and understanding** of what this file does and why it's important
3. **Propose the next logical file** to analyze based on your understanding`;
  } else if (userFeedback.action === "accept") {
    // User accepted previous analysis, continue to next file
    analysisScenario = nextFile
      ? `**CONTINUE TO NEXT FILE**: ${nextFile.name} (Previous analysis was accepted)
Reason for analyzing this file: ${nextFile.reason}`
      : "**CONTINUE ANALYSIS** (Previous analysis was accepted)";

    instructions = `1. **Analyze the new file content** thoroughly
2. **Build upon the accepted previous analysis** to maintain continuity
3. **Propose the next logical file** to analyze`;
  } else if (userFeedback.action === "reject") {
    // User rejected previous analysis, re-analyze current file
    analysisScenario = `**RE-ANALYZE CURRENT FILE**: ${
      currentFile?.name || "Unknown"
    } (Previous analysis was rejected)
User's rejection reason: ${userFeedback.reason}`;

    instructions = `1. **Re-examine the file content** with the user's feedback in mind
2. **Address the concerns** raised in the rejection reason
3. **Provide a corrected analysis** that better reflects the file's actual purpose and functionality
4. **Propose the next logical file** based on the corrected understanding`;
  } else if (userFeedback.action === "refined") {
    // User provided refined understanding, incorporate it and continue
    analysisScenario = `**INCORPORATE REFINEMENT AND CONTINUE**: ${
      nextFile?.name || "Next file"
    }
User provided refined understanding for ${currentFile?.name || "previous file"}:
- Original AI Analysis: ${
      currentFile?.analysis?.understanding || "No previous analysis"
    }
- User's Refined Understanding: ${userFeedback.userUnderstanding}
- User's Reason: ${userFeedback.reason || "No specific reason provided"}`;

    instructions = `1. **Acknowledge and incorporate** the user's refined understanding from the previous file
2. **Analyze the current file** with the refined context in mind
3. **Ensure consistency** between the refined previous analysis and current analysis
4. **Propose the next logical file** that builds upon this refined understanding`;
  }

  return `You are a code analysis assistant conducting iterative understanding of a codebase.

<AnalysisContext>
Repository: ${basic.repoName}
Main Goal: ${basic.mainGoal}
${
  basic.specificAreas
    ? `Specific Areas of Interest: ${basic.specificAreas}`
    : ""
}

File Structure:
${generateFileStructureWithStatus(basic.files)}
</AnalysisContext>

<AnalysisHistory>
${
  allUnderstandings && allUnderstandings.length > 0
    ? `Files analyzed so far (${
        allUnderstandings.length
      } files), DO NOT propose to re-read these files:
${allUnderstandings
  .map((understanding, index) => `${index + 1}. ${understanding.filename}`)
  .join("\n")}

Progress: You have analyzed ${
        allUnderstandings.length
      } files. Consider whether this provides sufficient understanding for the main goal or if more files are needed.

**CRITICAL**: These files have already been analyzed and summarized. DO NOT propose to re-read any of these files. The analysis above represents the complete understanding from these files.`
    : "This is the beginning of the analysis - no files have been analyzed yet."
}
</AnalysisHistory>

${
  relevantContexts.length > 0
    ? `<RelevantContext>
The following related file understandings might be useful for analyzing the current file:

${relevantContexts
  .map((context, index) => `${index + 1}. ${context}`)
  .join("\n\n")}

**Note**: Use this context to enhance your understanding but focus primarily on the current file being analyzed.
</RelevantContext>`
    : ""
}

<CurrentScenario>
${analysisScenario}
</CurrentScenario>

${
  toAnalyzeContent
    ? `<FileContent>
File: ${nextFile?.name || currentFile?.name || "Unknown"}
\`\`\`
${toAnalyzeContent}
\`\`\`
</FileContent>`
    : `<Note>File content will be loaded automatically for analysis</Note>`
}

<Instructions>
${instructions}

**CRITICAL ANALYSIS PRINCIPLES**:

1. **HIGH-CONFIDENCE SELECTION ONLY**: Only propose to read a file if you have HIGH CONFIDENCE (>80%) that it is directly relevant to the current user task and main goal. Do not propose files for exploratory purposes or "just to see what's there."

2. **NO REDUNDANT READING**: Never propose to re-read files that are already listed in the Analysis History. Those files have been completely analyzed and their understanding is already captured in the summaries above.

3. **TARGETED ANALYSIS**: Before proposing the next file, clearly articulate why that specific file is essential for understanding the main goal. Avoid generic reasoning like "to understand the project better" - be specific about what gap in understanding this file will fill.

4. **EFFICIENCY OVER COMPLETENESS**: It's better to analyze fewer, highly relevant files thoroughly than to read many files with marginal relevance. Focus on the files that are most critical to achieving the main goal.

Focus on understanding the codebase incrementally, but only when there's clear justification for reading additional files.

**Important**: Consider the analysis history and main goal to determine if you have sufficient understanding. If you believe you have analyzed enough files to achieve the main goal and understand the key aspects of the codebase, you should complete the analysis rather than continuing indefinitely.
</Instructions>

<OutputFormat>
**Every response MUST consist solely of valid YAML that conforms exactly to the schema below—no extra text, explanations, or comments.**

**If continuing analysis:**
\`\`\`yaml
current_analysis:
  filename: "current/file/path.ext"        # string - file being analyzed
  understanding: "Analysis and insights based on main goal"      # string - purpose, functionality, notable points
next_focus_proposal:
  next_filename: "next/file/path.ext"      # string - exactly ONE file to analyze next
  reason: "Why this is the logical next step"  # string - reasoning for next file choice
\`\`\`

**If analysis is complete:**
\`\`\`yaml
analysis_complete: true
final_understanding: "Overall comprehensive understanding"  # string - synthesis of all analyzed files
\`\`\`
</OutputFormat>

Analyze the file and provide your assessment:`;
};

export const reduceHistoryPrompt = ({
  basic,
  reducedOutput,
  understandingsBuffer,
  userFeedback,
}: Pick<
  SharedStorage,
  "basic" | "reducedOutput" | "understandingsBuffer" | "userFeedback"
>) => {
  const allUnderstandings = getAnalyzedUnderstandings(basic.files);

  return `You are a code analysis assistant responsible for maintaining a consolidated understanding of a codebase analysis.

<AnalysisContext>
Repository: ${basic.repoName}
Main Goal: ${basic.mainGoal}
${
  basic.specificAreas
    ? `Specific Areas of Interest: ${basic.specificAreas}`
    : ""
}
</AnalysisContext>

<CurrentReduction>
${
  reducedOutput
    ? `Previous Reduced Output:
${reducedOutput}`
    : "This is the first reduction - no previous output exists."
}
</CurrentReduction>

<NewInformation>
${understandingsBuffer
  .map((b) => `File: ${b.filename}\nAnalysis: ${b.understanding}`)
  .join("\n\n")}

User Feedback: ${userFeedback?.action || "No feedback"}
${
  userFeedback?.action === "refined"
    ? `(User provided refined understanding)`
    : ""
}
${userFeedback?.action === "accept" ? `(User accepted the analysis)` : ""}
</NewInformation>

<AllAnalyzedFiles>
Files analyzed so far (${allUnderstandings.length} files):
${allUnderstandings
  .map(
    (understanding, index) =>
      `${index + 1}. ${understanding.filename}: ${understanding.understanding}`
  )
  .join("\n")}
</AllAnalyzedFiles>

<Task>
**CRITICAL**: You must provide a COMPLETE, FULLY INTEGRATED analysis that combines the previous reduced output with the new information. Do NOT provide incremental updates or partial content.

Your task is to create a comprehensive, unified analysis that includes:

1. **Start with the previous reduced output** as your foundation
2. **Incorporate the current file's analysis** seamlessly into the existing understanding  
3. **Merge and synthesize** all information into ONE coherent, complete analysis
4. **Maintain all important insights** from the previous output while adding new findings
5. **Focus on the main goal** throughout the entire consolidated analysis
6. **Create a flowing narrative** that tells the complete story of the codebase understanding so far

**Important**: The output should be a COMPLETE analysis that someone could read independently to understand the entire codebase analysis progress, not just the latest update. Think of it as rewriting the entire analysis document with the new information included.
</Task>

<OutputFormat>
**Every response MUST consist solely of valid YAML that conforms exactly to the schema below—no extra text, explanations, or comments.**

\`\`\`yaml
reduced_output: |
  # COMPLETE, COMPREHENSIVE analysis that includes:
  # - ALL insights from the previous reduced output
  # - PLUS the new file's analysis fully integrated
  # - A coherent, unified understanding of the codebase
  # - Focus on the main analysis goal throughout
  # This should be a FULL document, not an incremental update
\`\`\`
</OutputFormat>

Integrate the new analysis and provide the updated reduced output:`;
};
