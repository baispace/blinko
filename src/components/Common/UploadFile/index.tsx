import { useDropzone } from "react-dropzone";
import { FileUploadIcon } from "../Icons";
import { Button } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { useState } from "react";
type IProps = {
  onUpload?: ({ filePath, fileName }) => void
}
export const UploadFileWrapper = ({ onUpload }: IProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const {
    getRootProps,
    getInputProps,
    open
  } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: async acceptedFiles => {
      setIsLoading(true)
      const file = acceptedFiles[0]!
      const formData = new FormData();
      formData.append('file', file)
      const response = await fetch('/api/file/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      onUpload?.(data)
      setIsLoading(false)
    }
  });

  return <div {...getRootProps()}>
    <input {...getInputProps()} />
    <Button onPress={open} isLoading={isLoading} color='primary' startContent={<Icon icon="tabler:upload" width="24" height="24" />}>Upload</Button>
  </div>
}