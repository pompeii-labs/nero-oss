import SwiftUI

struct MarkdownView: View {
    let content: String
    let isUser: Bool

    init(_ content: String, isUser: Bool = false) {
        self.content = content
        self.isUser = isUser
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(parseBlocks().enumerated()), id: \.offset) { _, block in
                renderBlock(block)
            }
        }
    }

    private func parseBlocks() -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var currentText = ""
        var inCodeBlock = false
        var codeLanguage = ""
        var codeContent = ""

        let lines = content.components(separatedBy: "\n")

        for line in lines {
            if line.hasPrefix("```") {
                if inCodeBlock {
                    blocks.append(.code(language: codeLanguage, content: codeContent.trimmingCharacters(in: .newlines)))
                    inCodeBlock = false
                    codeLanguage = ""
                    codeContent = ""
                } else {
                    if !currentText.isEmpty {
                        blocks.append(.text(currentText.trimmingCharacters(in: .newlines)))
                        currentText = ""
                    }
                    inCodeBlock = true
                    codeLanguage = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                }
            } else if inCodeBlock {
                codeContent += line + "\n"
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
                if !currentText.isEmpty {
                    blocks.append(.text(currentText.trimmingCharacters(in: .newlines)))
                    currentText = ""
                }
                blocks.append(.listItem(String(line.dropFirst(2))))
            } else if let (number, text) = parseNumberedListItem(line) {
                if !currentText.isEmpty {
                    blocks.append(.text(currentText.trimmingCharacters(in: .newlines)))
                    currentText = ""
                }
                blocks.append(.numberedListItem(number: number, text: text))
            } else {
                currentText += line + "\n"
            }
        }

        if inCodeBlock && !codeContent.isEmpty {
            blocks.append(.code(language: codeLanguage, content: codeContent.trimmingCharacters(in: .newlines)))
        } else if !currentText.isEmpty {
            blocks.append(.text(currentText.trimmingCharacters(in: .newlines)))
        }

        return blocks
    }

    private func parseNumberedListItem(_ line: String) -> (Int, String)? {
        let pattern = "^(\\d+)\\.\\s+(.+)$"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              let numberRange = Range(match.range(at: 1), in: line),
              let textRange = Range(match.range(at: 2), in: line),
              let number = Int(line[numberRange]) else {
            return nil
        }
        return (number, String(line[textRange]))
    }

    @ViewBuilder
    private func renderBlock(_ block: MarkdownBlock) -> some View {
        switch block {
        case .text(let text):
            renderInlineText(text)

        case .code(let language, let content):
            codeBlock(language: language, content: content)

        case .listItem(let text):
            HStack(alignment: .top, spacing: 8) {
                Circle()
                    .fill(Color.neroBlue)
                    .frame(width: 5, height: 5)
                    .padding(.top, 7)

                renderInlineText(text)
            }

        case .numberedListItem(let number, let text):
            HStack(alignment: .top, spacing: 8) {
                Text("\(number).")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.neroBlue)
                    .frame(width: 20, alignment: .trailing)

                renderInlineText(text)
            }
        }
    }

    private func renderInlineText(_ text: String) -> some View {
        let attributedString = parseInlineMarkdown(text)

        return Text(attributedString)
            .font(.system(size: 15))
            .textSelection(.enabled)
    }

    private func parseInlineMarkdown(_ text: String) -> AttributedString {
        var result = AttributedString()
        var remaining = text

        let codePattern = "`([^`]+)`"
        guard let codeRegex = try? NSRegularExpression(pattern: codePattern) else {
            return AttributedString(text)
        }

        while !remaining.isEmpty {
            let nsRange = NSRange(remaining.startIndex..., in: remaining)
            if let match = codeRegex.firstMatch(in: remaining, range: nsRange),
               let matchRange = Range(match.range, in: remaining),
               let codeRange = Range(match.range(at: 1), in: remaining) {

                let beforeCode = String(remaining[remaining.startIndex..<matchRange.lowerBound])
                result += parseBasicFormatting(beforeCode)

                var codeAttr = AttributedString(String(remaining[codeRange]))
                codeAttr.font = .system(size: 13, design: .monospaced)
                codeAttr.foregroundColor = .neroCyan
                codeAttr.backgroundColor = Color.neroCyan.opacity(0.15)
                result += codeAttr

                remaining = String(remaining[matchRange.upperBound...])
            } else {
                result += parseBasicFormatting(remaining)
                break
            }
        }

        return result
    }

    private func parseBasicFormatting(_ text: String) -> AttributedString {
        var result = AttributedString()
        var remaining = text

        let boldPattern = "\\*\\*([^*]+)\\*\\*"
        guard let boldRegex = try? NSRegularExpression(pattern: boldPattern) else {
            return AttributedString(text)
        }

        while !remaining.isEmpty {
            let nsRange = NSRange(remaining.startIndex..., in: remaining)
            if let match = boldRegex.firstMatch(in: remaining, range: nsRange),
               let matchRange = Range(match.range, in: remaining),
               let textRange = Range(match.range(at: 1), in: remaining) {

                let beforeBold = String(remaining[remaining.startIndex..<matchRange.lowerBound])
                result += AttributedString(beforeBold)

                var boldAttr = AttributedString(String(remaining[textRange]))
                boldAttr.font = .system(size: 15, weight: .bold)
                result += boldAttr

                remaining = String(remaining[matchRange.upperBound...])
            } else {
                result += AttributedString(remaining)
                break
            }
        }

        return result
    }

    private func codeBlock(language: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !language.isEmpty {
                HStack {
                    Text(language.uppercased())
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.neroBlue)

                    Spacer()

                    Button {
                        UIPasteboard.general.string = content
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 11))
                            .foregroundColor(.nMutedForeground)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.neroBlue.opacity(0.1))
            }

            ScrollView(.horizontal, showsIndicators: false) {
                Text(content)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.white.opacity(0.9))
                    .textSelection(.enabled)
                    .padding(12)
            }
        }
        .background(Color.nBackground.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.neroBlue.opacity(0.25), lineWidth: 1)
        )
    }
}

enum MarkdownBlock {
    case text(String)
    case code(language: String, content: String)
    case listItem(String)
    case numberedListItem(number: Int, text: String)
}

#Preview {
    ZStack {
        NeroBackgroundView()

        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                MarkdownView("""
                That's it. Four values:

                - `SUPABASE_PROJECT_URL`
                - `SUPABASE_SECRET_KEY` (the service_role one)
                - `OPENAI_API_KEY`
                - `PORT` (can leave as 3000)

                Go create the project, I'll be here. What are you gonna name it?
                """)

                MarkdownView("""
                Here's some **bold text** and regular text.

                ```swift
                func hello() {
                    print("Hello, world!")
                }
                ```

                1. First item
                2. Second item
                3. Third item
                """)
            }
            .padding()
        }
    }
}
