import AppKit
import Foundation

struct Cue: Decodable {
    let headline: String
    let caption: String
}
struct Manifest: Decodable {
    let width: Int
    let height: Int
    let cues: [Cue]
}

guard CommandLine.arguments.count == 3 else { fatalError("Expected manifest and output directory") }
let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let scale = CGFloat(manifest.width) / 720.0

func drawText(_ text: String, centeredAt centerY: CGFloat, maxHeight: CGFloat, preferredSize: CGFloat, width: CGFloat) {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    var size = preferredSize * scale
    let available = CGSize(width: width, height: .greatestFiniteMagnitude)
    var attributes: [NSAttributedString.Key: Any] = [:]
    var bounds = CGRect.zero
    repeat {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineBreakMode = .byWordWrapping
        attributes = [.font: NSFont.systemFont(ofSize: size, weight: .bold), .foregroundColor: NSColor.white,
                      .paragraphStyle: paragraph]
        bounds = (text as NSString).boundingRect(with: available, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes)
        if bounds.height <= maxHeight || size <= 20 * scale { break }
        size -= 2 * scale
    } while true
    let box = CGRect(x: (CGFloat(manifest.width) - width) / 2 - 12 * scale,
                     y: centerY - bounds.height / 2 - 13 * scale,
                     width: width + 24 * scale, height: bounds.height + 26 * scale)
    NSColor(calibratedWhite: 0.03, alpha: 0.76).setFill()
    NSBezierPath(roundedRect: box, xRadius: 15 * scale, yRadius: 15 * scale).fill()
    (text as NSString).draw(in: CGRect(x: (CGFloat(manifest.width) - width) / 2,
                                       y: centerY - bounds.height / 2,
                                       width: width, height: bounds.height + 4 * scale),
                            withAttributes: attributes)
}

for (index, cue) in manifest.cues.enumerated() {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: manifest.width,
        pixelsHigh: manifest.height, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Could not create subtitle bitmap")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    NSColor.clear.setFill()
    CGRect(x: 0, y: 0, width: manifest.width, height: manifest.height).fill()
    let textWidth = CGFloat(manifest.width) * 0.78
    drawText(cue.headline, centeredAt: CGFloat(manifest.height) * 0.77,
             maxHeight: CGFloat(manifest.height) * 0.14, preferredSize: 38, width: textWidth)
    drawText(cue.caption, centeredAt: CGFloat(manifest.height) * 0.17,
             maxHeight: CGFloat(manifest.height) * 0.15, preferredSize: 34, width: textWidth)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not encode subtitle PNG") }
    try png.write(to: output.appendingPathComponent("caption-\(index).png"))
}
