import { useParams } from "react-router-dom";
import { PublicHome } from "./PublicHome";

export const PublicCaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  return <PublicHome {...(id ? { initialCaseId: id } : {})} />;
};
