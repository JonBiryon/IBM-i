**free
///
// @Program......: B64DCD#R
// @Author.......: Jonathan Shalem
// @Creation date: 24/Sep/2024
// @Description..: Encode string to base64 format
///
// Encoding to base64 features combining every three characters' bytes(8-bit
//  parts) into a 24-bit string, and then dividing it into four 6-bit parts,
//  each of which represents a character between 0 and 63 (thus 64 different
//  character options).
// In this program, this is done using math operations over the numeric
//  representation of the characters, rather than the commonly practiced
//  bit-string manipulation, which aren't available in RPGLE.
///

/////---------------------------\\\\\
  /// --- Compiler options: --- \\\
/////---------------------------\\\\\
   ctl-opt option(*nodebugio);

/////--------------------\\\\\
  /// --- Constants: --- \\\
/////--------------------\\\\\
   dcl-c BASE64_CHAR_MAP 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/////--------------------\\\\\
  /// --- Interface: --- \\\
/////--------------------\\\\\
   dcl-pi *n;
      p_inp pointer const options(*string:*trim);
      p_out pointer const; // Will be 4/3 times longer than p_inp
   end-pi;

/////--------------------\\\\\
  /// --- Variables: --- \\\
/////--------------------\\\\\
   dcl-s inpLen uns(10);
   dcl-s inpRef pointer;
   dcl-s outRef pointer;
   dcl-s i uns(10) inz;
   dcl-s c uns(3) dim(3) based(inpRef); // Input character
   dcl-s bp uns(3) dim(2); // Bit-parts
   dcl-s nc uns(3); // Numeric representation of a 6-bit character
   dcl-s oc char(1) dim(4) based(outRef); // Encoded (output) character (derived from nc)
   dcl-s end ind;


/////---------------\\\\\
  /// --- Main: --- \\\
/////---------------\\\\\
  /// Input validations:
   if p_inp = *null;
      snd-msg %msg('CPF9898':'QCPFMSG':'Null input pointer');
   endif;

   if p_out = *null;
      snd-msg %msg('CPF9898':'QCPFMSG':'Null output pointer');
   endif;

   if %str(p_inp) = *blanks;
      snd-msg %msg('CPF9898':'QCPFMSG':'Blank input');
   endif;

   inpLen = %len(%trim(%str(p_inp)));

   if %size(%str(p_out)) < inpLen * 4 / 3;
      snd-msg %msg('CPF9898': 'QCPFMSG': 'Insufficient output size. Expected: ' +
       %char(inpLen * 4 / 3) + ', Received: ' + %char(%size(%str(p_out))));
   endif;

  /// Encoding:
   inpRef = p_inp;
   outRef = p_out;
   for i = 1 to inpLen by 3;
     // 1st 6-bit part
      nc = c(1)/4; // First 6 bits of the first byte. >>2 (/2^2)
      oc(1) = %subst(BASE64_CHAR_MAP:nc + 1:1); // Set the represented base64 character

     // 2nd 6-bit part
      bp(1) = %bitand(c(1):3) * 16; // Last 2 bits (2^2) of the first byte <<4 (*2^4)
      if i + 1 > inpLen;
         end = *on;
         bp(2) = 0;
      else;
         bp(2) = %uns(c(2) / 16); // First 4 bits of the second byte >>4 (/2^4)
      endif;
      nc = bp(1) + bp(2);
      oc(2) = %subst(BASE64_CHAR_MAP:nc + 1:1);

     // 3rd 6-bit part
      if end;
         oc(3) = '=';
         oc(4) = '=';
         leave;
      else;
         bp(1) = %bitand(c(2):15) * 4; // Last 4 bits (2^4) of the second byte <<2 (*2^2)
         if i + 2 > inpLen;
            end = *on;
            bp(2) = 0;
         else;
            bp(2) = %uns(c(3) / 64); // First 2 bits of the 3rd byte >>6 (/2^6)
         endif;
         nc = bp(1) + bp(2);
         oc(3) = %subst(BASE64_CHAR_MAP:nc + 1:1);
      endif;

     // 4th 6-bit part
      if end;
         oc(4) = '=';
         leave;
      else;
         nc = %uns(%bitand(c(3):63)); // Last 6 bits (2^6) of the 3rd byte
         oc(4) = %subst(BASE64_CHAR_MAP:nc + 1:1);
      endif;

      inpRef += 3; // Point to the next 3 input characters
      outRef += 4; // Point to the next 4 encoded characters
   endfor;

  /// End:
   *inlr = *on;
   return; 
