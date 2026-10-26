import { Navigate, useParams } from "react-router-dom";

/** Existing chapter links now open the unified topic workspace. */
export default function BlogTopicArrangePage() {
  const { topicId } = useParams();
  return <Navigate to={`/blog-manage/topic/${topicId}#chapters`} replace />;
}
