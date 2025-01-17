package src.main.scala.licenses

import sbt.IO
import src.main.scala.licenses.report.{
  Diagnostic,
  LicenseReview,
  PackageNotices,
  WithDiagnostics
}

/** Contains a sequence of dependencies and any attachments found.
  */
case class DependencySummary(
  dependencies: Seq[(DependencyInformation, Seq[Attachment])]
)

/** Review status of the [[Attachment]].
  */
sealed trait AttachmentStatus {

  /** Determines if the attachment with this status should be included in the
    * final package.
    */
  def included: Boolean
}
object AttachmentStatus {

  /** Indicates that the attachment should be kept.
    */
  case object Keep extends AttachmentStatus {

    /** @inheritdoc
      */
    override def included: Boolean = true
  }

  /** Indicates that the copyright mention should be kept, but its whole context
    * should be used instead of its content.
    *
    * Only valid for [[CopyrightMention]].
    */
  case object KeepWithContext extends AttachmentStatus {

    /** @inheritdoc
      */
    override def included: Boolean = true
  }

  /** Indicates that the attachment should be ignored.
    */
  case object Ignore extends AttachmentStatus {

    /** @inheritdoc
      */
    override def included: Boolean = false
  }

  /** Indicates that the attachment has been added manually.
    */
  case object Added extends AttachmentStatus {

    /** @inheritdoc
      */
    override def included: Boolean = true
  }

  /** Indicates that the attachment was not yet reviewed.
    */
  case object NotReviewed extends AttachmentStatus {

    /** @inheritdoc
      */
    override def included: Boolean = false
  }
}

/** Gathers information related to a dependency after the review.
  *
  * @param information original [[DependencyInformation]]
  * @param licenseReview review status of the dependency's main license
  * @param files list of files attached to the dependency, with their review
  *              statuses
  * @param copyrights list of copyright mentions attached to the dependency,
  *                   with their review statuses
  */
case class ReviewedDependency(
  information: DependencyInformation,
  licenseReview: LicenseReview,
  files: Seq[(AttachedFile, AttachmentStatus)],
  copyrights: Seq[(CopyrightMention, AttachmentStatus)]
) {

  /** Returns the count of problems that need to be addressed, like un-reviewed licenses or files.
    * This count may not be accurate and not include some of the problems,
    * as we only count the immediately addressable problems.
    * This is enough for a sorting heuristic.
    */
  def problemsCount: Int = {
    val unreviewedFiles = files.count(_._2 == AttachmentStatus.NotReviewed)
    val unreviewedCopyrights =
      copyrights.count(_._2 == AttachmentStatus.NotReviewed)
    val unreviewedLicenses = licenseReview match {
      case LicenseReview.NotReviewed => 1
      case _                         => 0
    }

    // If there's no info at all, that will also be a problem - add +1 problem to bring such dependencies higher up.
    val missingInfo = if (files.isEmpty && copyrights.isEmpty) 1 else 0

    unreviewedFiles + unreviewedCopyrights + unreviewedLicenses + missingInfo
  }
}

/** Summarizes the dependency review.
  *
  *  The reviewed version of [[DependencySummary]].
  *
  * @param dependencies sequence of reviewed dependencies
  * @param noticeHeader header to include in the generated NOTICE
  * @param additionalFiles additional files that should be added to the root of
  *                        the notice package
  */
case class ReviewedSummary(
  dependencies: Seq[ReviewedDependency],
  noticeHeader: String,
  additionalFiles: Seq[AttachedFile]
) {

  /** Returns a license-like file that is among attached files that are included
    * (if such file exists).
    */
  def includedLicense(dependency: ReviewedDependency): Option[AttachedFile] =
    dependency.files
      .find { f =>
        val isIncluded = f._2.included
        val name       = f._1.path.getFileName.toString.toLowerCase
        val isLicense  = name.contains("license") || name.contains("licence")
        isIncluded && isLicense
      }
      .map(_._1)
}

object ReviewedSummary {

  /** Returns a list of warnings that indicate missing reviews or other issues.
    */
  def warnAboutMissingReviews(
    summary: ReviewedSummary
  ): WithDiagnostics[Unit] = {
    val diagnostics = summary.dependencies.flatMap { dep =>
      val diagnostics = collection.mutable.Buffer[Diagnostic]()
      val name        = dep.information.moduleInfo.toString

      val missingFiles = dep.files.filter(_._2 == AttachmentStatus.NotReviewed)
      if (missingFiles.nonEmpty) {
        diagnostics.append(
          Diagnostic.Error(
            s"${missingFiles.size} files are not reviewed in $name."
          )
        )
      }
      val missingCopyrights =
        dep.copyrights.filter(_._2 == AttachmentStatus.NotReviewed)
      if (missingCopyrights.nonEmpty) {
        diagnostics.append(
          Diagnostic.Error(
            s"${missingCopyrights.size} copyrights are not reviewed in $name."
          )
        )
      }

      val includedInfos =
        (dep.files.map(_._2) ++ dep.copyrights.map(_._2)).filter(_.included)
      if (includedInfos.isEmpty) {
        diagnostics.append(
          Diagnostic.Error(
            s"No files or copyright information are included for $name. " +
            s"Generally every dependency should have _some_ copyright info, so " +
            s"this suggests all our heuristics failed. " +
            s"Please find the information manually and add it using `files-add` " +
            s"or `copyright-add`. Even if the dependency is in public domain, " +
            s"it may be good to include some information about its source."
          )
        )
      }

      dep.licenseReview match {
        case LicenseReview.NotReviewed =>
          diagnostics.append(
            Diagnostic.Error(
              s"Default license ${dep.information.license.name} for $name is " +
              s"used, but that license is not reviewed " +
              s"(need to add an entry to `reviewed-licenses`)."
            )
          )
        case LicenseReview.Default(
              defaultPath,
              allowAdditionalCustomLicenses
            ) =>
          if (!allowAdditionalCustomLicenses) {
            summary.includedLicense(dep) match {
              case Some(includedLicense) =>
                val licenseContent = IO.read(defaultPath.toFile)
                if (licenseContent.strip != includedLicense.content) {
                  diagnostics.append(
                    Diagnostic.Error(
                      s"A license file was discovered in $name that is different " +
                      s"from the default license file that is associated with its " +
                      s"license ${dep.information.license.name}, " +
                      s"but a custom license was not expected. " +
                      s"If this custom license should override the default one, " +
                      s"create a `custom-license` config file. " +
                      s"If both files are expected to be included, " +
                      s"create an empty `default-and-custom-license` file.",
                      metadata = Map(
                        "class"     -> "default-and-custom-license-clash",
                        "data-path" -> includedLicense.path.toString
                      )
                    )
                  )
                }
              case None =>
            }
          }
        case LicenseReview.Custom(filename) =>
          val fileIsIncluded =
            dep.files.exists(f => f._1.fileName == filename && f._2.included)
          val fileWillBeIncludedAsCopyrightNotices =
            filename == PackageNotices.gatheredNoticesFilename
          if (!fileIsIncluded && !fileWillBeIncludedAsCopyrightNotices) {
            diagnostics.append(
              Diagnostic.Error(
                s"License for $name is set to custom file `$filename`, but no such file is attached."
              )
            )
          }
      }

      diagnostics
    }
    WithDiagnostics.justDiagnostics(diagnostics)
  }
}
