%% tietreport.cls -- TIET university report class (CTAN v1.0)
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{tietreport}[2026/01/01 TIET Report Class v1.0]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{report}}
\ProcessOptions\relax
\LoadClass[twoside,12pt,openright]{report}

\RequirePackage[inner=1.5in,outer=1in,top=1.8in,bottom=0.85in]{geometry}
\RequirePackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[LE]{\thepage \quad \@tpHeader}
\fancyhead[RO]{\@tpTitle \quad \thepage}
\renewcommand{\headrulewidth}{0.5pt}
\renewcommand{\footrulewidth}{0pt}

\RequirePackage{titlesec}
\titleformat{\chapter}[display]
  {\raggedleft\bfseries\large}{Chapter \thechapter}{0.3em}{\huge}
  [\vspace{0.1em}\hrule]
\titlespacing*{\chapter}{0pt}{-50pt}{40pt}
\assignpagestyle{\chapter}{empty}

\RequirePackage{hyperref}
\RequirePackage{graphicx}
\RequirePackage{amsmath}
\RequirePackage{amssymb}

\newcommand{\@tpHeader}{UCS 503 Software Engineering Project Report}
\newcommand{\@tpTitle}{Proposal to Final}
\newcommand{\@tpSubTitle}{How to Write a Project Report}
\newcommand{\@tpAuthors}{%
  \texttt{102XXXXXXX} {Name Title} \\
  \texttt{102XXXXXXX} {Name Title} \\
  \texttt{102XXXXXXX} {Name Title} \\
  \texttt{102XXXXXXX} {Name Title}%
}
\newcommand{\@tpSubText}{Group: \texttt{3XXX} BE Third Year, CSE}
\newcommand{\@tpAdvisor}{Dr. NAME OF THE ADVISOR}
\newcommand{\@tpFooter}{%
  \large Mid-Semester Evaluation \\[0.2cm]
  \bfseries Computer Science and Engineering \\ Department \\[0.15cm]
  Thapar Institute of Engineering and \\ Technology, Patiala%
}

\newcommand{\TitlePageHeader}[1]{\renewcommand{\@tpHeader}{#1}}
\newcommand{\ProjectTitle}[1]{\renewcommand{\@tpTitle}{#1}}
\newcommand{\ProjectSubTitle}[1]{\renewcommand{\@tpSubTitle}{#1}}
\renewcommand{\author}[1]{\renewcommand{\@tpAuthors}{#1}}
\newcommand{\TitlePageSubText}[1]{\renewcommand{\@tpSubText}{#1}}
\newcommand{\AdvisorName}[1]{\renewcommand{\@tpAdvisor}{#1}}
\newcommand{\TitlePageFooterText}[1]{\renewcommand{\@tpFooter}{#1}}

\renewcommand{\maketitle}{%
  \begin{titlepage}
    \thispagestyle{empty}
    \centering
    \vspace*{0.5cm}
    {\large \textbf{\@tpHeader}\par}
    \vspace{2cm}
    {\LARGE \textbf{\@tpTitle}\par}
    \vspace{0.2cm}
    {\@tpSubTitle\par}
    \vspace{3.5cm}
    {\large \textbf{Submitted by:}\par}
    \vspace{0.2cm}
    {\large \@tpAuthors\par}
    \vspace{0.5cm}
    {\normalsize \@tpSubText\par}
    \vfill
    % The original block is retained but hidden when no advisor is supplied.
    \if\relax\detokenize\expandafter{\@tpAdvisor}\relax\else
      {\large \textbf{Submitted to:}\par}
      \vspace{0.2cm}
      {\normalsize \@tpAdvisor\par}
      \vspace{2cm}
    \fi
    {\normalsize \@tpFooter\par}
  \end{titlepage}
  \newpage
  \thispagestyle{empty}%
}

\endinput
